using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;
using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

/// <summary>处理 Stripe Webhook（<c>api/payment/webhook</c> 与 <c>api/stripe/webhook</c> 共用）。</summary>
public class StripeWebhookProcessor
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly IResendEmailService _resendEmail;
    private readonly ITelegramNotificationService _telegram;
    private readonly ILogger<StripeWebhookProcessor> _logger;

    public StripeWebhookProcessor(
        ApplicationDbContext context,
        IConfiguration configuration,
        IResendEmailService resendEmail,
        ITelegramNotificationService telegram,
        ILogger<StripeWebhookProcessor> logger)
    {
        _context = context;
        _configuration = configuration;
        _resendEmail = resendEmail;
        _telegram = telegram;
        _logger = logger;
    }

    public async Task<(int StatusCode, object? Body)> ProcessAsync(
        string json,
        string? stripeSignatureHeader,
        CancellationToken cancellationToken = default)
    {
        var webhookSecret = (_configuration["Stripe:WebhookSecret"] ?? "").Trim();
        if (string.IsNullOrEmpty(webhookSecret))
        {
            _logger.LogError("[Webhook] Stripe:WebhookSecret / STRIPE_WEBHOOK_SECRET is not configured");
            return (500, new { error = "Webhook secret not configured on server" });
        }

        if (string.IsNullOrWhiteSpace(stripeSignatureHeader))
        {
            _logger.LogWarning("[Webhook] Missing Stripe-Signature header");
            return (400, new { error = "Missing Stripe-Signature header" });
        }

        Event stripeEvent;
        try
        {
            // Dashboard 端点 API 版本常比 SDK 新（如 dahlia vs clover）；仍校验签名，放宽版本校验以免 400。
            stripeEvent = EventUtility.ConstructEvent(
                json,
                stripeSignatureHeader,
                webhookSecret,
                throwOnApiVersionMismatch: false);
        }
        catch (StripeException ex)
        {
            _logger.LogWarning(ex, "[Webhook] Stripe signature or payload invalid");
            return (400, new { error = $"Webhook error: {ex.Message}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Webhook] Failed to parse Stripe event");
            return (400, new { error = "Invalid webhook payload" });
        }

        try
        {
            if (await _context.StripeProcessedEvents.AnyAsync(e => e.Id == stripeEvent.Id, cancellationToken))
                return (200, null);

            if (stripeEvent.Type == "checkout.session.completed")
                return await HandleCheckoutSessionCompletedAsync(stripeEvent, cancellationToken);

            if (stripeEvent.Type == "checkout.session.async_payment_succeeded")
                return await HandleCheckoutSessionAsyncPaymentSucceededAsync(stripeEvent, cancellationToken);

            if (stripeEvent.Type == "checkout.session.async_payment_failed")
                return await HandleCheckoutSessionAsyncPaymentFailedAsync(stripeEvent, cancellationToken);

            // invoice.*、charge.* 等：已收到即可，避免 Stripe 反复重试
            _context.StripeProcessedEvents.Add(new StripeProcessedEvent
            {
                Id = stripeEvent.Id,
                ProcessedAtUtc = DateTime.UtcNow,
            });
            await _context.SaveChangesAsync(cancellationToken);
            return (200, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Webhook] Handler failed for event {EventId} type {Type}", stripeEvent.Id, stripeEvent.Type);
            return (500, new { error = "Webhook handler failed" });
        }
    }

    private async Task<(int StatusCode, object? Body)> HandleCheckoutSessionCompletedAsync(
        Event stripeEvent,
        CancellationToken cancellationToken)
    {
        var session = stripeEvent.Data.Object as Session;
        if (session == null)
            return (400, new { error = "Invalid session object" });

        if (!int.TryParse(session.ClientReferenceId, out var orderId))
            return (400, new { error = "Invalid order ID in session" });

        var order = await _context.Orders.FindAsync([orderId], cancellationToken);
        if (order == null)
            return (400, new { error = $"Order {orderId} not found" });

        var wasAlreadyPaid = string.Equals(order.OrderStatus, "Paid", StringComparison.Ordinal);
        await ApplyPaidFromSessionAsync(order, session, stripeEvent.Id, cancellationToken);
        if (!wasAlreadyPaid)
            await NotifyPaidIfNeededAsync(orderId, session, cancellationToken);
        return (200, null);
    }

    private async Task<(int StatusCode, object? Body)> HandleCheckoutSessionAsyncPaymentSucceededAsync(
        Event stripeEvent,
        CancellationToken cancellationToken)
    {
        var session = stripeEvent.Data.Object as Session;
        if (session == null)
        {
            await MarkProcessedOnlyAsync(stripeEvent.Id, cancellationToken);
            return (200, null);
        }

        if (!int.TryParse(session.ClientReferenceId, out var orderId))
            return (400, null);

        var order = await _context.Orders.FindAsync([orderId], cancellationToken);
        var wasAlreadyPaid = order != null && string.Equals(order.OrderStatus, "Paid", StringComparison.Ordinal);
        if (order != null && !wasAlreadyPaid)
            await ApplyPaidFromSessionAsync(order, session, stripeEvent.Id, cancellationToken);
        else
            await MarkProcessedOnlyAsync(stripeEvent.Id, cancellationToken);

        if (order != null && !wasAlreadyPaid)
            await NotifyPaidIfNeededAsync(orderId, session, cancellationToken);

        return (200, null);
    }

    private async Task<(int StatusCode, object? Body)> HandleCheckoutSessionAsyncPaymentFailedAsync(
        Event stripeEvent,
        CancellationToken cancellationToken)
    {
        var session = stripeEvent.Data.Object as Session;
        if (session == null)
        {
            await MarkProcessedOnlyAsync(stripeEvent.Id, cancellationToken);
            return (200, null);
        }

        if (!int.TryParse(session.ClientReferenceId, out var orderId))
            return (400, null);

        var order = await _context.Orders.FindAsync([orderId], cancellationToken);
        if (order != null)
        {
            order.OrderStatus = "Pending";
            _context.Orders.Update(order);
        }

        await MarkProcessedOnlyAsync(stripeEvent.Id, cancellationToken);
        return (200, null);
    }

    private async Task ApplyPaidFromSessionAsync(
        Order order,
        Session session,
        string stripeEventId,
        CancellationToken cancellationToken)
    {
        var wasAlreadyPaid = string.Equals(order.OrderStatus, "Paid", StringComparison.Ordinal);
        if (!wasAlreadyPaid)
        {
            order.OrderStatus = "Paid";
            order.StripePaymentIntentId = session.PaymentIntentId;
        }

        var invoiceId = await StripeInvoiceHelper.ResolveInvoiceIdFromSessionAsync(
            session,
            order.StripeSessionId ?? session.Id,
            cancellationToken);
        if (!string.IsNullOrWhiteSpace(invoiceId))
            order.StripeInvoiceId = invoiceId;

        _context.Orders.Update(order);
        _context.StripeProcessedEvents.Add(new StripeProcessedEvent
        {
            Id = stripeEventId,
            ProcessedAtUtc = DateTime.UtcNow,
        });
        await _context.SaveChangesAsync(cancellationToken);
    }

    private async Task MarkProcessedOnlyAsync(string stripeEventId, CancellationToken cancellationToken)
    {
        _context.StripeProcessedEvents.Add(new StripeProcessedEvent
        {
            Id = stripeEventId,
            ProcessedAtUtc = DateTime.UtcNow,
        });
        await _context.SaveChangesAsync(cancellationToken);
    }

    private async Task NotifyPaidIfNeededAsync(
        int orderId,
        Session session,
        CancellationToken cancellationToken)
    {
        try
        {
            await OrderPaidNotifier.TryNotifyPickupEmailAsync(
                _context,
                _resendEmail,
                orderId,
                _logger,
                session.CustomerDetails?.Email ?? session.CustomerEmail,
                _configuration["Store:PickupAddress"] ?? "IGA Beverly Hills",
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Webhook] Pickup email failed order {OrderId}", orderId);
        }

        try
        {
            await _telegram.NotifyOrderPaidAsync(orderId, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Webhook] Telegram failed order {OrderId}", orderId);
        }
    }
}
