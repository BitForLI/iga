using Stripe;
using Stripe.Checkout;
using System.Threading;
using System.Threading.Tasks;

namespace IGA.Services
{
    public class StripeService : IStripeService
    {
        private readonly Microsoft.Extensions.Configuration.IConfiguration _configuration;

        public StripeService(Microsoft.Extensions.Configuration.IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public async Task<Session> CreateCheckoutSessionAsync(string successUrl, string cancelUrl, SessionCreateOptions? options = null)
        {
            if (options == null)
                throw new System.ArgumentNullException(nameof(options));

            options.SuccessUrl ??= successUrl;
            options.CancelUrl ??= cancelUrl;

            var service = new SessionService();
            return await service.CreateAsync(options);
        }

        public async Task<bool> ValidateWebhookSignatureAsync(string payload, string sigHeader, string webhookSecret)
        {
            if (string.IsNullOrEmpty(webhookSecret)) return false;
            try
            {
                var stripeEvent = EventUtility.ConstructEvent(payload, sigHeader, webhookSecret);
                return await Task.FromResult(stripeEvent != null);
            }
            catch
            {
                return await Task.FromResult(false);
            }
        }

        public async Task<(bool Ok, string? ErrorMessage, string? RefundId)> CreatePartialRefundAsync(
            string paymentIntentId,
            long amountMinorUnits,
            string idempotencyKey,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(paymentIntentId))
                return (false, "PaymentIntentId 为空", null);
            if (amountMinorUnits < 1)
                return (false, "退款金额必须至少 1 个最小货币单位", null);

            var stripeSecret = (_configuration["Stripe:SecretKey"] ?? "").Trim();
            if (string.IsNullOrWhiteSpace(stripeSecret))
                return (false, "Stripe SecretKey 未配置", null);

            StripeConfiguration.ApiKey = stripeSecret;

            var options = new RefundCreateOptions
            {
                PaymentIntent = paymentIntentId,
                Amount = amountMinorUnits,
            };

            var requestOptions = new RequestOptions
            {
                IdempotencyKey = idempotencyKey,
            };

            try
            {
                var service = new RefundService();
                var refund = await service.CreateAsync(options, requestOptions, cancellationToken);
                return (true, null, refund.Id);
            }
            catch (StripeException ex)
            {
                return (false, ex.Message, null);
            }
        }
    }
}
