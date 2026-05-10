using Stripe.Checkout;
using System.Threading;
using System.Threading.Tasks;

namespace IGA.Services
{
    public interface IStripeService
    {
        Task<Session> CreateCheckoutSessionAsync(string successUrl, string cancelUrl, SessionCreateOptions? options = null);
        Task<bool> ValidateWebhookSignatureAsync(string payload, string sigHeader, string webhookSecret);

        /// <summary>
        /// 对已支付的 PaymentIntent 做部分退款（称重差价等）。金额为最小货币单位（如 aud 为分）。
        /// </summary>
        Task<(bool Ok, string? ErrorMessage, string? RefundId)> CreatePartialRefundAsync(
            string paymentIntentId,
            long amountMinorUnits,
            string idempotencyKey,
            CancellationToken cancellationToken = default);
    }
}
