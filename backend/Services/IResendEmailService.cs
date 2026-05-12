namespace IGA.Services;

public interface IResendEmailService
{
    /// <summary>Sends the registration email verification code.</summary>
    Task<bool> SendRegistrationVerificationAsync(string toEmail, string name, string code, CancellationToken cancellationToken = default);

    /// <summary>Sends the password-reset verification code.</summary>
    Task<bool> SendPasswordResetVerificationAsync(string toEmail, string name, string code, CancellationToken cancellationToken = default);

    /// <summary>After payment: pickup code (pickup) or order confirmation (delivery).</summary>
    Task<bool> SendOrderPaidPickupAsync(
        string toEmail,
        string customerName,
        int orderId,
        string pickupCode,
        string orderType,
        DateTime? pickupTimeUtc,
        string? deliveryAddress,
        string? pickupAddress,
        CancellationToken cancellationToken = default);

    /// <summary>Refund approved and processed via Stripe.</summary>
    Task<bool> SendRefundApprovedAsync(
        string toEmail,
        string customerName,
        int orderId,
        decimal refundAmount,
        DateTime processedAtUtc,
        CancellationToken cancellationToken = default);

    /// <summary>Refund rejected, including the reason.</summary>
    Task<bool> SendRefundRejectedAsync(
        string toEmail,
        string customerName,
        int orderId,
        string reason,
        DateTime processedAtUtc,
        CancellationToken cancellationToken = default);

    /// <summary>Website contact form: notify admin/staff; optional Reply-To customer email.</summary>
    Task<bool> SendContactInquiryAsync(
        IReadOnlyList<string> toEmails,
        string customerName,
        string customerEmail,
        string message,
        CancellationToken cancellationToken = default);
}
