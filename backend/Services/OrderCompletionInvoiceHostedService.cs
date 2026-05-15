using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

/// <summary>
/// 自提/配送标记完成（<see cref="Order.PickedUpAt"/>）满 N 天后，向顾客邮箱发送一次收据（非 Stripe 官方发票）。
/// </summary>
public sealed class OrderCompletionInvoiceHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OrderCompletionInvoiceHostedService> _logger;

    public OrderCompletionInvoiceHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<OrderCompletionInvoiceHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalHours = Math.Clamp(_configuration.GetValue("Invoice:RunIntervalHours", 6), 1, 24);
        var delay = TimeSpan.FromMinutes(2); // 启动后稍缓，避免与迁移抢连接
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(delay, stoppingToken);
                delay = TimeSpan.FromHours(intervalHours);
                await RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[CompletionInvoice] Scheduled run failed");
            }
        }
    }

    private async Task RunOnceAsync(CancellationToken stoppingToken)
    {
        var days = Math.Clamp(_configuration.GetValue("Invoice:DaysAfterCompletion", 2), 0, 30);
        var cutoff = DateTime.UtcNow.AddDays(-days);

        string storeName;
        string? abn;
        List<int> orderIds;

        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync(stoppingToken);
            storeName = string.IsNullOrWhiteSpace(store?.StoreName) ? "IGA Beverly Hills" : store!.StoreName.Trim();
            abn = store?.AbnNumber?.Trim();

            orderIds = await db.Orders
                .AsNoTracking()
                .Where(o =>
                    o.OrderStatus == "Prepared"
                    && o.PickedUpAt != null
                    && o.PickedUpAt <= cutoff
                    && o.CompletionInvoiceSentAt == null)
                .OrderBy(o => o.Id)
                .Select(o => o.Id)
                .Take(50)
                .ToListAsync(stoppingToken);
        }

        if (orderIds.Count == 0)
            return;

        foreach (var orderId in orderIds)
        {
            stoppingToken.ThrowIfCancellationRequested();
            await TrySendForOrderAsync(orderId, days, storeName, abn, stoppingToken);
        }
    }

    private async Task TrySendForOrderAsync(
        int orderId,
        int daysAfterCompletion,
        string storeName,
        string? abn,
        CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var resend = scope.ServiceProvider.GetRequiredService<IResendEmailService>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var order = await db.Orders
            .Include(o => o.User)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId, ct);

        if (order?.User == null
            || order.OrderStatus != "Prepared"
            || !order.PickedUpAt.HasValue
            || order.CompletionInvoiceSentAt != null)
        {
            await tx.RollbackAsync(ct);
            return;
        }

        var cutoff = DateTime.UtcNow.AddDays(-daysAfterCompletion);
        if (order.PickedUpAt > cutoff)
        {
            await tx.RollbackAsync(ct);
            return;
        }

        var email = (order.User.Email ?? "").Trim();
        if (string.IsNullOrEmpty(email)
            || !email.Contains('@', StringComparison.Ordinal)
            || email.EndsWith("@iga.local", StringComparison.OrdinalIgnoreCase))
        {
            order.CompletionInvoiceSentAt = DateTime.UtcNow; // 避免永久重试无效邮箱
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            _logger.LogInformation("[CompletionInvoice] Skipped order {OrderId}: no usable customer email", orderId);
            return;
        }

        var useStripeInvoice = _configuration.GetValue("Invoice:UseStripeInvoice", true);
        var sent = false;

        if (useStripeInvoice)
        {
            StripeInvoiceHelper.EnsureApiKey(_configuration);
            var invoiceId = order.StripeInvoiceId;

            if (string.IsNullOrWhiteSpace(invoiceId))
            {
                invoiceId = await StripeInvoiceHelper.ResolveInvoiceIdFromSessionAsync(null, order.StripeSessionId, ct);
                if (!string.IsNullOrWhiteSpace(invoiceId))
                    order.StripeInvoiceId = invoiceId;
            }

            if (string.IsNullOrWhiteSpace(invoiceId)
                && !string.IsNullOrWhiteSpace(order.StripePaymentIntentId))
            {
                var currency = (_configuration["Stripe:CheckoutCurrency"] ?? "aud").Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(currency)) currency = "aud";
                var (created, newId, createErr) = await StripeInvoiceHelper.CreateAndFinalizePaidInvoiceForOrderAsync(
                    order, currency, storeName, abn, ct);
                if (created && !string.IsNullOrWhiteSpace(newId))
                {
                    order.StripeInvoiceId = newId;
                    invoiceId = newId;
                }
                else if (!string.IsNullOrEmpty(createErr))
                {
                    _logger.LogWarning(
                        "[CompletionInvoice] Could not create Stripe invoice for order {OrderId}: {Error}",
                        orderId,
                        createErr);
                }
            }

            if (!string.IsNullOrWhiteSpace(invoiceId))
            {
                var (stripeOk, stripeErr) = await StripeInvoiceHelper.SendInvoiceEmailAsync(invoiceId, ct);
                sent = stripeOk;
                if (!stripeOk)
                {
                    _logger.LogWarning(
                        "[CompletionInvoice] Stripe SendInvoice failed for order {OrderId}: {Error}",
                        orderId,
                        stripeErr);
                }
            }
        }

        if (!sent)
        {
            var lines = (order.Items ?? new List<OrderItem>())
                .Select(i => (
                    ProductName: i.ProductName ?? $"Item #{i.Id}",
                    Quantity: i.Quantity,
                    UnitPrice: i.PriceAtPurchase,
                    LineTotal: ComputeLineTotal(i)))
                .ToList();

            var pickedUpUtc = order.PickedUpAt!.Value;
            var customerName = string.IsNullOrWhiteSpace(order.User.Name) ? "Customer" : order.User.Name.Trim();
            sent = await resend.SendOrderCompletionInvoiceAsync(
                email,
                customerName,
                order.Id,
                order.OrderType ?? "Pickup",
                pickedUpUtc,
                order.TotalAmount,
                order.FinalAmount,
                order.DeliveryAddress,
                lines,
                storeName,
                abn,
                ct);

            if (!sent)
            {
                await tx.RollbackAsync(ct);
                _logger.LogWarning("[CompletionInvoice] Invoice email failed for order {OrderId}; will retry later", orderId);
                return;
            }
        }

        order.CompletionInvoiceSentAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        _logger.LogInformation(
            "[CompletionInvoice] Sent invoice for order {OrderId} ({Channel})",
            orderId,
            useStripeInvoice && !string.IsNullOrWhiteSpace(order.StripeInvoiceId) ? "Stripe" : "Resend");
    }

    /// <summary>与结账行金额一致：称重按实际或预估重量 × 单价；否则 单价 × 数量。</summary>
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
