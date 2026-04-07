using Stripe.Checkout;
using System.Threading.Tasks;

namespace IGA.Services
{
    public interface IStripeService
    {
        Task<Session> CreateCheckoutSessionAsync(string successUrl, string cancelUrl, SessionCreateOptions? options = null);
        Task<bool> ValidateWebhookSignatureAsync(string payload, string sigHeader, string webhookSecret);
    }
}
