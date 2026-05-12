using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

public class TelegramNotificationService : ITelegramNotificationService
{
    public const string HttpClientName = "TelegramBot";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _configuration;
    private readonly ApplicationDbContext _db;
    private readonly ILogger<TelegramNotificationService> _logger;

    public TelegramNotificationService(
        IHttpClientFactory httpFactory,
        IConfiguration configuration,
        ApplicationDbContext db,
        ILogger<TelegramNotificationService> logger)
    {
        _httpFactory = httpFactory;
        _configuration = configuration;
        _db = db;
        _logger = logger;
    }

    public async Task NotifyOrderPaidAsync(int orderId, CancellationToken cancellationToken = default)
    {
        var order = await _db.Orders
            .AsNoTracking()
            .Include(o => o.User)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken);

        if (order?.User == null)
        {
            _logger.LogWarning("[Telegram] Paid-order notification skipped: order or user missing orderId={OrderId}", orderId);
            return;
        }

        var text = BuildOrderPaidMessage(order, order.User);
        await SendMessageAsync(text, "order paid", orderId, cancellationToken);
    }

    private async Task SendMessageAsync(string text, string logLabel, int orderId, CancellationToken cancellationToken)
    {
        var token = (_configuration["Telegram:BotToken"] ?? "").Trim();
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogInformation(
                "[Telegram] Skipped {Label}: Telegram:BotToken is empty (env Telegram__BotToken or config Telegram:BotToken)",
                logLabel);
            return;
        }

        var chatId = await ResolveChatIdAsync(cancellationToken);
        if (string.IsNullOrEmpty(chatId))
        {
            _logger.LogInformation(
                "[Telegram] Skipped {Label}: ChatId is empty (Telegram:ChatId or StoreConfigs.TelegramChatId)",
                logLabel);
            return;
        }

        var url = $"https://api.telegram.org/bot{token}/sendMessage";

        object chatIdForJson = long.TryParse(chatId.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var chatLong)
            ? chatLong
            : chatId;

        var payload = new Dictionary<string, object?>
        {
            ["chat_id"] = chatIdForJson,
            ["text"] = text,
            ["disable_notification"] = false,
        };

        try
        {
            var http = _httpFactory.CreateClient(HttpClientName);
            using var req = new HttpRequestMessage(HttpMethod.Post, url);
            var json = JsonSerializer.Serialize(payload, JsonOpts);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
            req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");

            var resp = await http.SendAsync(req, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("[Telegram] sendMessage failed HTTP {Status}: {Body}", (int)resp.StatusCode, body);
                return;
            }

            _logger.LogInformation("[Telegram] {Label} sent orderId={OrderId}", logLabel, orderId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Telegram] {Label} error orderId={OrderId}", logLabel, orderId);
        }
    }

    private async Task<string?> ResolveChatIdAsync(CancellationToken cancellationToken)
    {
        var fromConfig = (_configuration["Telegram:ChatId"] ?? "").Trim();
        if (!string.IsNullOrEmpty(fromConfig))
            return fromConfig;

        var row = await _db.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync(cancellationToken);
        var fromDb = (row?.TelegramChatId ?? "").Trim();
        return string.IsNullOrEmpty(fromDb) ? null : fromDb;
    }

    private string? StaffPortalLine()
    {
        var baseUrl = (_configuration["Telegram:StaffPortalBaseUrl"] ?? "").Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
            return null;
        return $"Staff portal (accept / pack): {baseUrl}";
    }

    private static string FormatPickupTimeLocal(DateTime? utc)
    {
        if (!utc.HasValue)
            return "-";

        var u = DateTime.SpecifyKind(utc.Value, DateTimeKind.Utc);
        var tz = TryAustraliaSydney();
        if (tz == null)
            return u.ToString("yyyy-MM-dd HH:mm'Z'", CultureInfo.InvariantCulture) + " UTC";

        var local = TimeZoneInfo.ConvertTimeFromUtc(u, tz);
        return local.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " (Sydney)";
    }

    private static TimeZoneInfo? TryAustraliaSydney()
    {
        foreach (var id in new[] { "Australia/Sydney", "AUS Eastern Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
                // try next
            }
            catch (InvalidTimeZoneException)
            {
                // try next
            }
        }

        return null;
    }

    private string BuildOrderPaidMessage(Order order, User user)
    {
        var typeLabel = order.OrderType == "Delivery" ? "Delivery" : order.OrderType == "Pickup" ? "Pickup" : order.OrderType ?? "-";
        var name = user.Name ?? "";
        var email = user.Email ?? "";
        var pickupTime = FormatPickupTimeLocal(order.PickupTime);
        var addr = string.IsNullOrWhiteSpace(order.DeliveryAddress) ? "-" : order.DeliveryAddress.Trim();
        var code = string.IsNullOrWhiteSpace(order.PickupCode) ? "-" : order.PickupCode.Trim();

        var lines = order.Items?.Select(i =>
            $"• {i.ProductName} × {i.Quantity} @ ${i.PriceAtPurchase:F2}") ?? Enumerable.Empty<string>();
        var itemsBlock = string.Join("\n", lines);
        if (string.IsNullOrEmpty(itemsBlock))
            itemsBlock = "(No line items)";

        var staffLine = StaffPortalLine();
        var staffBlock = string.IsNullOrEmpty(staffLine)
            ? "Staff portal: open your site /staff → Orders → To accept"
            : staffLine;

        return $"""
            ✅ Order paid #{order.Id} — please pick / pack
            Customer: {name}
            Email: {email}
            Type: {typeLabel}
            Amount paid: ${order.TotalAmount:F2}
            Pickup code: {code}
            Scheduled time: {pickupTime}
            Delivery address: {addr}

            📋 Items:
            {itemsBlock}

            👉 Next: sign in to the staff portal, go to Orders → To accept, then follow your packing flow.
            {staffBlock}
            """;
    }
}
