using Stripe;
using Stripe.Checkout;
using igaServer.Models;

namespace IGA.Services;

/// <summary>Stripe 正式发票：Checkout invoice_creation、延迟发送、无发票时的补建。</summary>
public static class StripeInvoiceHelper
{
    public static void EnsureApiKey(IConfiguration configuration)
    {
        var key = (configuration["Stripe:SecretKey"] ?? "").Trim();
        if (!string.IsNullOrEmpty(key))
            StripeConfiguration.ApiKey = key;
    }

    /// <summary>从 Checkout Session 读取 <c>invoice</c> ID（必要时再请求 Stripe）。</summary>
    public static async Task<string?> ResolveInvoiceIdFromSessionAsync(
        Session? session,
        string? stripeSessionId,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(session?.InvoiceId))
            return session.InvoiceId;

        var sid = (session?.Id ?? stripeSessionId)?.Trim();
        if (string.IsNullOrEmpty(sid))
            return null;

        var svc = new SessionService();
        var full = await svc.GetAsync(sid, cancellationToken: cancellationToken);
        return string.IsNullOrWhiteSpace(full.InvoiceId) ? null : full.InvoiceId;
    }

    /// <summary>Stripe 向客户邮箱发送正式发票（含 PDF / 托管发票页链接）。</summary>
    public static async Task<(bool Ok, string? Error)> SendInvoiceEmailAsync(
        string invoiceId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(invoiceId))
            return (false, "Invoice id is empty");

        try
        {
            var invoiceService = new InvoiceService();
            var sent = await invoiceService.SendInvoiceAsync(invoiceId, cancellationToken: cancellationToken);
            return (sent != null, null);
        }
        catch (StripeException ex)
        {
            return (false, ex.Message);
        }
    }

    /// <summary>旧订单未开 invoice_creation 时，按已支付订单补建发票并标记为已付（out of band），再发送。</summary>
    public static async Task<(bool Ok, string? InvoiceId, string? Error)> CreateAndFinalizePaidInvoiceForOrderAsync(
        Order order,
        string currency,
        string? storeName,
        string? abn,
        CancellationToken cancellationToken = default)
    {
        if (order.Items == null || order.Items.Count == 0)
            return (false, null, "Order has no line items");

        var customerId = await ResolveOrCreateCustomerAsync(order, cancellationToken);
        if (string.IsNullOrEmpty(customerId))
            return (false, null, "Could not resolve Stripe customer for invoice");

        var invoiceItemService = new InvoiceItemService();
        foreach (var item in order.Items)
        {
            var amountCents = (long)Math.Round(ComputeLineTotal(item) * 100m, MidpointRounding.AwayFromZero);
            if (amountCents < 1) continue;

            await invoiceItemService.CreateAsync(
                new InvoiceItemCreateOptions
                {
                    Customer = customerId,
                    Amount = amountCents,
                    Currency = currency,
                    Description = item.ProductName ?? $"Item #{item.Id}",
                },
                cancellationToken: cancellationToken);
        }

        var itemsSubtotal = order.Items.Sum(ComputeLineTotal);
        var deliveryFee = order.TotalAmount - itemsSubtotal;
        if (deliveryFee > 0.01m)
        {
            var feeCents = (long)Math.Round(deliveryFee * 100m, MidpointRounding.AwayFromZero);
            if (feeCents >= 1)
            {
                await invoiceItemService.CreateAsync(
                    new InvoiceItemCreateOptions
                    {
                        Customer = customerId,
                        Amount = feeCents,
                        Currency = currency,
                        Description = "Delivery fee",
                    },
                    cancellationToken: cancellationToken);
            }
        }

        var footer = string.IsNullOrWhiteSpace(abn) ? null : $"ABN: {abn}";
        var invoiceService = new InvoiceService();
        var invoice = await invoiceService.CreateAsync(
            new InvoiceCreateOptions
            {
                Customer = customerId,
                CollectionMethod = "send_invoice",
                DaysUntilDue = 0,
                AutoAdvance = false,
                Description = $"{storeName ?? "IGA"} — order #{order.Id}",
                Footer = footer,
                Metadata = new Dictionary<string, string> { ["order_id"] = order.Id.ToString() },
            },
            cancellationToken: cancellationToken);

        invoice = await invoiceService.FinalizeInvoiceAsync(invoice.Id, cancellationToken: cancellationToken);

        await invoiceService.PayAsync(
            invoice.Id,
            new InvoicePayOptions { PaidOutOfBand = true },
            cancellationToken: cancellationToken);

        return (true, invoice.Id, null);
    }

    private static async Task<string?> ResolveOrCreateCustomerAsync(Order order, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(order.StripePaymentIntentId))
        {
            var piService = new PaymentIntentService();
            var pi = await piService.GetAsync(order.StripePaymentIntentId, cancellationToken: cancellationToken);
            if (!string.IsNullOrWhiteSpace(pi.CustomerId))
                return pi.CustomerId;
        }

        if (!string.IsNullOrWhiteSpace(order.StripeSessionId))
        {
            var sessionService = new SessionService();
            var session = await sessionService.GetAsync(order.StripeSessionId, cancellationToken: cancellationToken);
            if (!string.IsNullOrWhiteSpace(session.CustomerId))
                return session.CustomerId;
        }

        var email = order.User?.Email?.Trim();
        if (string.IsNullOrEmpty(email) || !email.Contains('@', StringComparison.Ordinal))
            return null;

        var customerService = new CustomerService();
        var created = await customerService.CreateAsync(
            new CustomerCreateOptions
            {
                Email = email,
                Name = string.IsNullOrWhiteSpace(order.User?.Name) ? null : order.User.Name.Trim(),
                Metadata = new Dictionary<string, string> { ["order_id"] = order.Id.ToString() },
            },
            cancellationToken: cancellationToken);

        return created.Id;
    }

    private static decimal ComputeLineTotal(OrderItem i)
    {
        if (i.Quantity >= 1 && i.ExpectedWeight > 0)
        {
            var w = i.ActualWeight ?? i.ExpectedWeight;
            if (w > 0)
                return Math.Round(i.PriceAtPurchase * (decimal)w, 2, MidpointRounding.AwayFromZero);
        }

        return Math.Round(i.PriceAtPurchase * i.Quantity, 2, MidpointRounding.AwayFromZero);
    }
}
