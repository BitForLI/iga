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

    public async Task NotifyNewOrderCreatedAsync(Order order, User user, CancellationToken cancellationToken = default)
    {
        var token = (_configuration["Telegram:BotToken"] ?? "").Trim();
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogInformation("[Telegram] 未发送新订单通知：Telegram:BotToken 为空（请设置 appsettings / 环境变量 Telegram__BotToken，并确认 ASPNETCORE_ENVIRONMENT=Development 或已在生产环境配置变量）");
            return;
        }

        var chatId = await ResolveChatIdAsync(cancellationToken);
        if (string.IsNullOrEmpty(chatId))
        {
            _logger.LogInformation("[Telegram] 未发送新订单通知：ChatId 为空（Telegram:ChatId 或 StoreConfigs.TelegramChatId）");
            return;
        }

        var text = BuildNewOrderMessagePlain(order, user);
        var url = $"https://api.telegram.org/bot{token}/sendMessage";

        // chat_id：私聊/群聊用数字更稳妥；不设 parse_mode，避免 HTML 解析失败导致 400
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

            _logger.LogInformation("[Telegram] 新订单通知已发送 orderId={OrderId}", order.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Telegram] 新订单通知异常 orderId={OrderId}", order.Id);
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

    private static string BuildNewOrderMessagePlain(Order order, User user)
    {
        var typeLabel = order.OrderType == "Delivery" ? "配送" : order.OrderType == "Pickup" ? "自提" : order.OrderType ?? "-";
        var name = user.Name ?? "";
        var email = user.Email ?? "";
        var lines = order.Items?.Select(i =>
            $"• {i.ProductName} × {i.Quantity} @ ${i.PriceAtPurchase:F2}") ?? Enumerable.Empty<string>();
        var itemsBlock = string.Join("\n", lines);

        return $"""
            🔔 新订单 #{order.Id}
            顾客: {name}
            邮箱: {email}
            类型: {typeLabel}
            金额: ${order.TotalAmount:F2}（待支付）
            {itemsBlock}
            """;
    }
}
