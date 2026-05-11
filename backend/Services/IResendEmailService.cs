namespace IGA.Services;

public interface IResendEmailService
{
    /// <summary>发送注册邮箱验证码。</summary>
    Task<bool> SendRegistrationVerificationAsync(string toEmail, string name, string code, CancellationToken cancellationToken = default);

    /// <summary>支付成功后发送取件码（自取）或订单确认（配送）。</summary>
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

    /// <summary>退款申请已同意并通过 Stripe 处理。</summary>
    Task<bool> SendRefundApprovedAsync(
        string toEmail,
        string customerName,
        int orderId,
        decimal refundAmount,
        DateTime processedAtUtc,
        CancellationToken cancellationToken = default);

    /// <summary>退款申请已拒绝，包含拒绝原因。</summary>
    Task<bool> SendRefundRejectedAsync(
        string toEmail,
        string customerName,
        int orderId,
        string reason,
        DateTime processedAtUtc,
        CancellationToken cancellationToken = default);
}
