using Stripe;
using Stripe.Checkout;
using System.Threading.Tasks;

namespace IGA.Services
{
    public class StripeService : IStripeService
    {
        private readonly string _webhookSecret;

        public StripeService(Microsoft.Extensions.Configuration.IConfiguration configuration)
        {
            _webhookSecret = configuration["Stripe:WebhookSecret"];
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
    }
}
