using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace IGA.Services;

public class ResendEmailService : IResendEmailService
{
    private readonly HttpClient _http;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ResendEmailService> _logger;

    public ResendEmailService(
        HttpClient http,
        IConfiguration configuration,
        ILogger<ResendEmailService> logger)
    {
        _http = http;
        _configuration = configuration;
        _logger = logger;
        _http.BaseAddress = new Uri("https://api.resend.com/");
    }

    private string? ApiKey => (_configuration["Resend:ApiKey"] ?? "").Trim();
    private string FromEmail => (_configuration["Resend:FromEmail"] ?? "onboarding@resend.dev").Trim();

    private static string DescribeEmail(string email)
    {
        var at = email.LastIndexOf('@');
        if (at < 0 || at == email.Length - 1) return "(invalid)";
        return $"***@{email[(at + 1)..]}";
    }

    private static string Truncate(string value, int maxLength = 500) =>
        value.Length <= maxLength ? value : value[..maxLength] + "...";

    public async Task<bool> SendRegistrationVerificationAsync(string toEmail, string name, string code, CancellationToken cancellationToken = default)
    {
        var subject = "Your IGA verification code";
        var html =
            $"""
            <p>Hi {System.Net.WebUtility.HtmlEncode(name)},</p>
            <p>Your verification code is:</p>
            <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{System.Net.WebUtility.HtmlEncode(code)}</p>
            <p>This code expires in 15 minutes.</p>
            <p>If you did not register, ignore this email.</p>
            """;
        return await SendEmailAsync(toEmail, subject, html, cancellationToken);
    }

    public async Task<bool> SendOrderPaidPickupAsync(
        string toEmail,
        string customerName,
        int orderId,
        string pickupCode,
        string orderType,
        DateTime? pickupTimeUtc,
        CancellationToken cancellationToken = default)
    {
        var subject = $"Order #{orderId} confirmed — pickup code";
        string pickupLine;
        if (string.Equals(orderType, "Pickup", StringComparison.OrdinalIgnoreCase))
        {
            var when = pickupTimeUtc.HasValue
                ? $"{pickupTimeUtc.Value:yyyy-MM-dd HH:mm} UTC"
                : "as selected";
            pickupLine =
                $"<p><strong>Pickup code:</strong> {System.Net.WebUtility.HtmlEncode(pickupCode)}</p>" +
                $"<p>Pickup time: {System.Net.WebUtility.HtmlEncode(when)}</p>";
        }
        else
        {
            pickupLine = "<p>Your delivery order is confirmed. We will prepare it shortly.</p>";
        }

        var html =
            $"""
            <p>Hi {System.Net.WebUtility.HtmlEncode(customerName)},</p>
            <p>Thank you! Order <strong>#{orderId}</strong> is paid.</p>
            {pickupLine}
            <p>See you at IGA.</p>
            """;
        return await SendEmailAsync(toEmail, subject, html, cancellationToken);
    }

    private async Task<bool> SendEmailAsync(string toEmail, string subject, string html, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(ApiKey))
        {
            _logger.LogWarning(
                "[Resend] ApiKey 未配置，跳过发信。请在 appsettings 中设置 Resend:ApiKey、Resend:FromEmail（需在 Resend 验证发件域名）。收件人: {To}",
                DescribeEmail(toEmail));
            return false;
        }

        _logger.LogInformation(
            "[Resend] 准备发送邮件。To={To}, From={From}, Subject={Subject}",
            DescribeEmail(toEmail),
            FromEmail,
            subject);

        var payload = new
        {
            from = FromEmail,
            to = new[] { toEmail },
            subject,
            html,
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, "emails");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            var resp = await _http.SendAsync(req, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError(
                    "[Resend] 发送失败。HTTP {Status}, To={To}, From={From}, Body={Body}",
                    (int)resp.StatusCode,
                    DescribeEmail(toEmail),
                    FromEmail,
                    Truncate(body));
                return false;
            }

            _logger.LogInformation(
                "[Resend] 发送成功。HTTP {Status}, To={To}, Body={Body}",
                (int)resp.StatusCode,
                DescribeEmail(toEmail),
                Truncate(body));
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Resend] 发送失败");
            return false;
        }
    }
}
