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

    public Task NotifyNewOrderCreatedAsync(Order order, User user, CancellationToken cancellationToken = default)
    {
        var text = BuildNewOrderPendingMessage(order, user);
        return SendMessageAsync(text, "新订单(待支付)", order.Id, cancellationToken);
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
            _logger.LogWarning("[Telegram] 已支付通知跳过：订单或用户不存在 orderId={OrderId}", orderId);
            return;
        }

        var text = BuildOrderPaidMessage(order, order.User);
        await SendMessageAsync(text, "订单已支付", orderId, cancellationToken);
    }

    private async Task SendMessageAsync(string text, string logLabel, int orderId, CancellationToken cancellationToken)
    {
        var token = (_configuration["Telegram:BotToken"] ?? "").Trim();
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogInformation(
                "[Telegram] 未发送{Label}：Telegram:BotToken 为空（环境变量 Telegram__BotToken 或配置节 Telegram:BotToken）",
                logLabel);
            return;
        }

        var chatId = await ResolveChatIdAsync(cancellationToken);
        if (string.IsNullOrEmpty(chatId))
        {
            _logger.LogInformation(
                "[Telegram] 未发送{Label}：ChatId 为空（Telegram:ChatId 或数据库 StoreConfigs.TelegramChatId）",
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
                _logger.LogWarning("[Telegram] sendMessage 失败 HTTP {Status}: {Body}", (int)resp.StatusCode, body);
                return;
            }

            _logger.LogInformation("[Telegram] {Label} 已发送 orderId={OrderId}", logLabel, orderId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Telegram] {Label} 异常 orderId={OrderId}", logLabel, orderId);
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
        return $"员工后台（接单/备货）: {baseUrl}";
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

    private static string BuildNewOrderPendingMessage(Order order, User user)
    {
        var typeLabel = order.OrderType == "Delivery" ? "配送" : order.OrderType == "Pickup" ? "自提" : order.OrderType ?? "-";
        var name = user.Name ?? "";
        var email = user.Email ?? "";
        var lines = order.Items?.Select(i =>
            $"• {i.ProductName} × {i.Quantity} @ ${i.PriceAtPurchase:F2}") ?? Enumerable.Empty<string>();
        var itemsBlock = string.Join("\n", lines);
        if (string.IsNullOrEmpty(itemsBlock))
            itemsBlock = "（无明细）";

        return $"""
            🛒 新订单 #{order.Id}（待支付）
            顾客: {name}
            邮箱: {email}
            类型: {typeLabel}
            金额: ${order.TotalAmount:F2}

            📋 商品:
            {itemsBlock}

            ⏳ 请等待顾客完成 Stripe 支付。
            支付成功后会再推送一条「已支付」通知，届时请备货。
            """;
    }

    private string BuildOrderPaidMessage(Order order, User user)
    {
        var typeLabel = order.OrderType == "Delivery" ? "配送" : order.OrderType == "Pickup" ? "自提" : order.OrderType ?? "-";
        var name = user.Name ?? "";
        var email = user.Email ?? "";
        var pickupTime = FormatPickupTimeLocal(order.PickupTime);
        var addr = string.IsNullOrWhiteSpace(order.DeliveryAddress) ? "-" : order.DeliveryAddress.Trim();
        var code = string.IsNullOrWhiteSpace(order.PickupCode) ? "-" : order.PickupCode.Trim();

        var lines = order.Items?.Select(i =>
            $"• {i.ProductName} × {i.Quantity} @ ${i.PriceAtPurchase:F2}") ?? Enumerable.Empty<string>();
        var itemsBlock = string.Join("\n", lines);
        if (string.IsNullOrEmpty(itemsBlock))
            itemsBlock = "（无明细）";

        var staffLine = StaffPortalLine();
        var staffBlock = string.IsNullOrEmpty(staffLine)
            ? "员工后台: 打开站点 /staff → Orders → To accept"
            : staffLine;

        return $"""
            ✅ 订单已支付 #{order.Id} — 请备货/拣货
            顾客: {name}
            邮箱: {email}
            类型: {typeLabel}
            实付金额: ${order.TotalAmount:F2}
            取件码: {code}
            预约时间: {pickupTime}
            配送地址: {addr}

            📋 商品:
            {itemsBlock}

            👉 操作建议: 登录员工后台，在 Orders → To accept 接单，然后按流程拣货/备餐。
            {staffBlock}
            """;
    }
}
