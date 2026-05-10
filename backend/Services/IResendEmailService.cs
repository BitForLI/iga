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
        CancellationToken cancellationToken = default);
}
