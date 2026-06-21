using System.Linq;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace IGA.Services;

public class ResendEmailService : IResendEmailService
{
    static ResendEmailService()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

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
        return await SendEmailAsync(
            toEmails,
            subject,
            html,
            replyTo: customerEmail.Trim(),
            attachments: null,
            cancellationToken: cancellationToken);
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
        var saleTime = FormatAustralianTime(pickedUpAtUtc);
        var invoiceTotal = finalTotalAud ?? chargedTotalAud;
        var totalItems = lines.Sum(l => l.Quantity);
        var pdfBytes = BuildReceiptPdf(
            orderId,
            saleTime,
            invoiceTotal,
            totalItems,
            lines,
            storeName,
            abn,
            storePhone,
            storeAddress,
            deliveryAddress);

        var html = $"<p>Your tax invoice for order <strong>#{orderId}</strong> is attached as a PDF.</p>";
        var attachments = new[]
        {
            (Filename: $"invoice-order-{orderId}.pdf", Content: Convert.ToBase64String(pdfBytes))
        };

        return await SendEmailAsync(
            new[] { toEmail },
            subject,
            html,
            replyTo: null,
            attachments: attachments,
            cancellationToken: cancellationToken);
    }

    private Task<bool> SendEmailAsync(string toEmail, string subject, string html, CancellationToken cancellationToken) =>
        SendEmailAsync(
            new[] { toEmail },
            subject,
            html,
            replyTo: null,
            attachments: null,
            cancellationToken: cancellationToken);

    private async Task<bool> SendEmailAsync(
        IReadOnlyList<string> toEmails,
        string subject,
        string html,
        string? replyTo,
        IReadOnlyList<(string Filename, string Content)>? attachments,
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

        var payload = new Dictionary<string, object?>
        {
            ["from"] = FromEmail,
            ["to"] = list,
            ["subject"] = subject,
            ["html"] = html,
        };

        if (!string.IsNullOrWhiteSpace(replyTo))
            payload["reply_to"] = replyTo.Trim();

        if (attachments is { Count: > 0 })
        {
            payload["attachments"] = attachments
                .Select(a => new Dictionary<string, object?>
                {
                    ["filename"] = a.Filename,
                    ["content"] = a.Content,
                })
                .ToArray();
        }

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

    private static byte[] BuildReceiptPdf(
        int orderId,
        string saleTime,
        decimal invoiceTotal,
        int totalItems,
        IReadOnlyList<(string ProductName, int Quantity, decimal UnitPrice, decimal LineTotal, double ExpectedWeight, double? ActualWeight)> lines,
        string storeName,
        string? abn,
        string? storePhone,
        string? storeAddress,
        string? deliveryAddress)
    {
        using var stream = new MemoryStream();

        // Force receipt header text so invoice always shows required store legal info.
        var displayStoreName = "BEVERLY HILLS";
        const string safePhone = "TEL 9150 0190";
        const string safeAbn = "ABN: 20619331547";
        var safeStoreAddress = string.IsNullOrWhiteSpace(storeAddress) ? string.Empty : storeAddress.Trim().ToUpperInvariant();
        if (safeStoreAddress == "IGA BEVERLY HILLS" || safeStoreAddress == displayStoreName)
            safeStoreAddress = string.Empty;
        var safeDelivery = string.IsNullOrWhiteSpace(deliveryAddress) ? string.Empty : $"Delivery: {deliveryAddress.Trim()}";

        // Tuple: Text, Bold, FontSize, SeparatorBefore, Align, RightText (non-null = two-column row), Color
        var receiptLines = new List<(string Text, bool Bold, float FontSize, bool SeparatorBefore, string Align, string? RightText, string Color)>();
        void AddLine(string text, bool bold = false, float fontSize = 9f, bool separatorBefore = false, string align = "center", string? rightText = null, string color = "#000000") =>
            receiptLines.Add((text, bold, fontSize, separatorBefore, align, rightText, color));

        // Header
        AddLine("* TAX INVOICE *", bold: true, fontSize: 11f);
        AddLine(string.Empty);
        AddLine(displayStoreName, bold: true, fontSize: 10f);
        AddLine(safePhone, fontSize: 8f, color: "#9ca3af");
        if (!string.IsNullOrWhiteSpace(safeStoreAddress)) AddLine(safeStoreAddress);
        AddLine(string.Empty);
        AddLine(safeAbn, fontSize: 8f, color: "#9ca3af");
        AddLine(string.Empty);
        AddLine($"SALE    Tx# {orderId}  {saleTime}", fontSize: 8f);
        if (!string.IsNullOrWhiteSpace(safeDelivery)) AddLine(safeDelivery, align: "left");

        // Products — name + line total on same row, no blank line between products
        var firstProduct = true;
        foreach (var line in lines)
        {
            AddLine(line.ProductName, bold: true, align: "left", rightText: $"{line.LineTotal:0.00}", separatorBefore: firstProduct);
            firstProduct = false;

            if (line.ExpectedWeight > 0)
            {
                var weight = line.ActualWeight ?? line.ExpectedWeight;
                AddLine($"  {weight:0.##} kg @ ${line.UnitPrice:0.00}/kg", align: "left");
            }
            else
            {
                AddLine($"  {line.Quantity} x ${line.UnitPrice:0.00}", align: "left");
            }
        }

        // Totals — two-column with separator
        AddLine($"Total for {totalItems} items:", separatorBefore: true, align: "left", rightText: $"${invoiceTotal:0.00}");
        AddLine("Cheque:", align: "left", rightText: $"${invoiceTotal:0.00}");
        AddLine("CHANGE:", align: "left", rightText: "$0.00");

        AddLine(string.Empty);
        AddLine("STORE: 1  REGISTER: 2", separatorBefore: true, fontSize: 8f, color: "#9ca3af");
        AddLine("* Denotes Taxable Item", fontSize: 8f, color: "#9ca3af");
        AddLine("** Denotes Manual Weight Entry", fontSize: 8f, color: "#9ca3af");
        AddLine(string.Empty);
        AddLine("TRADING HOURS", bold: true, fontSize: 8f, color: "#9ca3af");
        AddLine("MON-FRI 7AM - 8PM", fontSize: 8f, color: "#9ca3af");
        AddLine("SAT 8AM - 6PM", fontSize: 8f, color: "#9ca3af");
        AddLine("SUN 9AM - 6PM", fontSize: 8f, color: "#9ca3af");

        // 80 mm wide receipt paper: 1 mm = 2.8346 pt
        const float receiptWidthPt = 226.77f;
        const float receiptHeightPt = 900f;

        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(new PageSize(receiptWidthPt, receiptHeightPt));
                page.Margin(8);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(style => style.FontSize(9).FontFamily("Courier New"));

                page.Content().Column(column =>
                {
                    column.Spacing(2);

                    foreach (var line in receiptLines)
                    {
                        if (line.SeparatorBefore)
                        {
                            column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                        }

                        if (line.RightText != null)
                        {
                            // Two-column: label on left, value on right
                            column.Item().Row(row =>
                            {
                                var leftText = row.RelativeItem().Text(line.Text).FontSize(line.FontSize).AlignLeft();
                                leftText.FontColor(line.Color);
                                if (line.Bold) leftText.SemiBold();

                                var rightText = row.AutoItem().Text(line.RightText).FontSize(line.FontSize).AlignRight();
                                rightText.FontColor(line.Color);
                                if (line.Bold) rightText.SemiBold();
                            });
                        }
                        else
                        {
                            column.Item().Element(item =>
                            {
                                var text = line.Align switch
                                {
                                    "left" => item.Text(line.Text).FontSize(line.FontSize).AlignLeft(),
                                    "right" => item.Text(line.Text).FontSize(line.FontSize).AlignRight(),
                                    _ => item.Text(line.Text).FontSize(line.FontSize).AlignCenter(),
                                };
                                text.FontColor(line.Color);
                                if (line.Bold) text.SemiBold();
                            });
                        }
                    }
                });
            });
        }).GeneratePdf(stream);

        return stream.ToArray();
    }

    private static string FormatAustralianTime(DateTime utcDateTime)
    {
        var tz = GetAustralianTimeZone();
        var converted = utcDateTime.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc)
            : utcDateTime.ToUniversalTime();
        return TimeZoneInfo.ConvertTimeFromUtc(converted, tz).ToString("dd/MM/yyyy HH:mm:ss");
    }

    private static TimeZoneInfo GetAustralianTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Australia/Sydney");
        }
        catch
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("AUS Eastern Standard Time");
            }
            catch
            {
                return TimeZoneInfo.Local;
            }
        }
    }
}
