using System.Linq;
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
    private string Currency => (_configuration["Stripe:CheckoutCurrency"] ?? "aud").Trim().ToUpperInvariant();

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

    public async Task<bool> SendPasswordResetVerificationAsync(string toEmail, string name, string code, CancellationToken cancellationToken = default)
    {
        var subject = "Your IGA password reset code";
        var html =
            $"""
            <p>Hi {System.Net.WebUtility.HtmlEncode(name)},</p>
            <p>We received a request to reset your password. Your verification code is:</p>
            <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{System.Net.WebUtility.HtmlEncode(code)}</p>
            <p>This code expires in 15 minutes.</p>
            <p>If you did not request this, you can ignore this email — your password will stay the same.</p>
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
        string? deliveryAddress,
        string? pickupAddress,
        CancellationToken cancellationToken = default)
    {
        var isPickup = string.Equals(orderType, "Pickup", StringComparison.OrdinalIgnoreCase);
        var subject = isPickup ? $"Order #{orderId} confirmed — pickup code" : $"Order #{orderId} confirmed";
        string fulfillmentLine;
        if (string.Equals(orderType, "Pickup", StringComparison.OrdinalIgnoreCase))
        {
            var when = pickupTimeUtc.HasValue
                ? $"{pickupTimeUtc.Value:yyyy-MM-dd HH:mm} UTC"
                : "as selected";
            fulfillmentLine =
                $"<p><strong>Pickup code:</strong> {System.Net.WebUtility.HtmlEncode(pickupCode)}</p>" +
                $"<p><strong>Pickup time:</strong> {System.Net.WebUtility.HtmlEncode(when)}</p>" +
                $"<p><strong>Pickup address:</strong> {System.Net.WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(pickupAddress) ? "IGA Beverly Hills" : pickupAddress)}</p>";
        }
        else
        {
            fulfillmentLine =
                "<p>Your delivery order is confirmed. We will prepare it shortly.</p>" +
                $"<p><strong>Delivery address:</strong> {System.Net.WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(deliveryAddress) ? "as provided at checkout" : deliveryAddress)}</p>";
        }

        var html =
            $"""
            <p>Hi {System.Net.WebUtility.HtmlEncode(customerName)},</p>
            <p>Thank you! Order <strong>#{orderId}</strong> is paid.</p>
            {fulfillmentLine}
            <p>See you at IGA.</p>
            """;
        return await SendEmailAsync(toEmail, subject, html, cancellationToken);
    }

    public async Task<bool> SendRefundApprovedAsync(
        string toEmail,
        string customerName,
        int orderId,
        decimal refundAmount,
        DateTime processedAtUtc,
        CancellationToken cancellationToken = default)
    {
        var subject = $"Refund approved for order #{orderId}";
        var html =
            $"""
            <p>Hi {System.Net.WebUtility.HtmlEncode(customerName)},</p>
            <p>Your refund request for order <strong>#{orderId}</strong> has been approved and processed.</p>
            <p><strong>Refund amount:</strong> {System.Net.WebUtility.HtmlEncode(Currency)} ${refundAmount:0.00}</p>
            <p><strong>Processed at:</strong> {processedAtUtc:yyyy-MM-dd HH:mm} UTC</p>
            <p>Stripe has accepted the refund. Most card refunds appear on the customer's statement within 5-10 business days, depending on the card issuer.</p>
            """;
        return await SendEmailAsync(toEmail, subject, html, cancellationToken);
    }

    public async Task<bool> SendRefundRejectedAsync(
        string toEmail,
        string customerName,
        int orderId,
        string reason,
        DateTime processedAtUtc,
        CancellationToken cancellationToken = default)
    {
        var subject = $"Refund request update for order #{orderId}";
        var html =
            $"""
            <p>Hi {System.Net.WebUtility.HtmlEncode(customerName)},</p>
            <p>Your refund request for order <strong>#{orderId}</strong> has been reviewed and rejected.</p>
            <p><strong>Processed at:</strong> {processedAtUtc:yyyy-MM-dd HH:mm} UTC</p>
            <p><strong>Reason:</strong> {System.Net.WebUtility.HtmlEncode(reason)}</p>
            <p>No refund has been issued for this request.</p>
            """;
        return await SendEmailAsync(toEmail, subject, html, cancellationToken);
    }

    public async Task<bool> SendContactInquiryAsync(
        IReadOnlyList<string> toEmails,
        string customerName,
        string customerEmail,
        string message,
        CancellationToken cancellationToken = default)
    {
        var safeName = System.Net.WebUtility.HtmlEncode(customerName);
        var safeEmail = System.Net.WebUtility.HtmlEncode(customerEmail);
        var safeMsg = System.Net.WebUtility.HtmlEncode(message).Replace("\n", "<br/>");
        var subject = $"[IGA Website] Message from {customerName}";
        var html =
            $"""
            <p><strong>Customer name:</strong> {safeName}</p>
            <p><strong>Customer email:</strong> {safeEmail}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space:pre-wrap;border-left:3px solid #dc2626;padding-left:12px;">{safeMsg}</p>
            <p style="color:#64748b;font-size:13px;">Reply in your mail client will go to the customer if your client supports Reply-To.</p>
            """;
        return await SendEmailAsync(toEmails, subject, html, customerEmail.Trim(), cancellationToken);
    }

    public async Task<bool> SendOrderCompletionReceiptAsync(
        string toEmail,
        string customerName,
        int orderId,
        string orderType,
        DateTime pickedUpAtUtc,
        decimal chargedTotalAud,
        decimal? finalTotalAud,
        string? deliveryAddress,
        IReadOnlyList<(string ProductName, int Quantity, decimal UnitPrice, decimal LineTotal, double ExpectedWeight, double? ActualWeight)> lines,
        string storeName,
        string? abn,
        string? storePhone,
        string? storeAddress,
        CancellationToken cancellationToken = default)
    {
        var subject = $"{storeName} — receipt for order #{orderId}";
        var saleTime = pickedUpAtUtc.ToLocalTime().ToString("dd/MM/yyyy HH:mm:ss");
        var invoiceTotal = finalTotalAud ?? chargedTotalAud;
        var totalItems = lines.Sum(l => l.Quantity);

        var safeStoreName = System.Net.WebUtility.HtmlEncode(storeName.ToUpperInvariant());
        var safeAbn = string.IsNullOrWhiteSpace(abn) ? string.Empty : $"ABN: {System.Net.WebUtility.HtmlEncode(abn)}";
        var safePhone = string.IsNullOrWhiteSpace(storePhone) ? string.Empty : $"TEL {System.Net.WebUtility.HtmlEncode(storePhone.Trim())}";
        var safeStoreAddress = string.IsNullOrWhiteSpace(storeAddress) ? string.Empty : System.Net.WebUtility.HtmlEncode(storeAddress.Trim()).ToUpperInvariant();
        var safeDelivery = string.IsNullOrWhiteSpace(deliveryAddress) ? string.Empty : $"Delivery: {System.Net.WebUtility.HtmlEncode(deliveryAddress.Trim())}";

        var receipt = new StringBuilder();
        receipt.AppendLine("<div style=\"font-family:Menlo,Consolas,monospace;white-space:pre-wrap;line-height:1.3;max-width:560px;\">");
        receipt.AppendLine("* TAX INVOICE *");
        receipt.AppendLine(safeStoreName);
        if (!string.IsNullOrEmpty(safePhone))
        {
            receipt.AppendLine(safePhone);
        }
        if (!string.IsNullOrEmpty(safeStoreAddress))
        {
            receipt.AppendLine(safeStoreAddress);
        }
        if (!string.IsNullOrEmpty(safeAbn))
        {
            receipt.AppendLine(safeAbn);
        }
        receipt.AppendLine();
        receipt.AppendLine($"SALE    Tx# {orderId}  {saleTime}");
        if (!string.IsNullOrEmpty(safeDelivery))
        {
            receipt.AppendLine(safeDelivery);
        }
        receipt.AppendLine();

        foreach (var line in lines)
        {
            var productName = System.Net.WebUtility.HtmlEncode(line.ProductName);
            receipt.AppendLine(productName);

            if (line.ExpectedWeight > 0)
            {
                var weight = line.ActualWeight ?? line.ExpectedWeight;
                receipt.AppendLine($"quantity: {weight:0.##} @ ${line.UnitPrice:0.00} per kg");
            }
            else
            {
                receipt.AppendLine($"quantity: {line.Quantity} @ ${line.UnitPrice:0.00} each");
            }

            receipt.AppendLine($"${line.LineTotal:0.00}".PadLeft(40));
            receipt.AppendLine();
        }

        receipt.AppendLine($"{("Total for " + totalItems + " items:").PadRight(28)}${invoiceTotal:0.00}");
        receipt.AppendLine($"{("Cheque:").PadRight(28)}${invoiceTotal:0.00}");
        receipt.AppendLine($"{("CHANGE:").PadRight(28)}$0.00");
        receipt.AppendLine();
        receipt.AppendLine("STORE: 1  REGISTER: 2");
        receipt.AppendLine("* - Denotes Taxable Item");
        receipt.AppendLine("** - Denotes Manual Weight Entry");
        receipt.AppendLine("TRADING HOURS");
        receipt.AppendLine("MON-FRI 7AM - 8PM");
        receipt.AppendLine("SAT 8AM - 6PM");
        receipt.AppendLine("SUN 9AM - 6PM");
        receipt.AppendLine("</div>");

        var html = receipt.ToString();

        return await SendEmailAsync(toEmail, subject, html, cancellationToken);
    }

    private Task<bool> SendEmailAsync(string toEmail, string subject, string html, CancellationToken cancellationToken) =>
        SendEmailAsync(new[] { toEmail }, subject, html, replyTo: null, cancellationToken);

    private async Task<bool> SendEmailAsync(
        IReadOnlyList<string> toEmails,
        string subject,
        string html,
        string? replyTo,
        CancellationToken cancellationToken)
    {
        var list = toEmails?.Where(e => !string.IsNullOrWhiteSpace(e)).Select(e => e.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                   ?? new List<string>();
        if (list.Count == 0)
        {
            _logger.LogWarning("[Resend] No valid recipients; skipping send. Subject={Subject}", subject);
            return false;
        }

        if (string.IsNullOrWhiteSpace(ApiKey))
        {
            _logger.LogWarning(
                "[Resend] ApiKey is not configured; skipping send. Set Resend:ApiKey and Resend:FromEmail in appsettings. Recipients: {To}",
                string.Join(", ", list.Select(DescribeEmail)));
            return false;
        }

        _logger.LogInformation(
            "[Resend] Sending email. To={To}, From={From}, Subject={Subject}, ReplyTo={ReplyTo}",
            string.Join(", ", list.Select(DescribeEmail)),
            FromEmail,
            subject,
            replyTo != null ? DescribeEmail(replyTo) : "(none)");

        object payload = string.IsNullOrWhiteSpace(replyTo)
            ? new { from = FromEmail, to = list, subject, html }
            : new { from = FromEmail, to = list, reply_to = replyTo.Trim(), subject, html };

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
                    "[Resend] Send failed. HTTP {Status}, To={To}, From={From}, Body={Body}",
                    (int)resp.StatusCode,
                    string.Join(", ", list.Select(DescribeEmail)),
                    FromEmail,
                    Truncate(body));
                return false;
            }

            _logger.LogInformation(
                "[Resend] Send succeeded. HTTP {Status}, To={To}, Body={Body}",
                (int)resp.StatusCode,
                string.Join(", ", list.Select(DescribeEmail)),
                Truncate(body));
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Resend] Send failed");
            return false;
        }
    }
}
