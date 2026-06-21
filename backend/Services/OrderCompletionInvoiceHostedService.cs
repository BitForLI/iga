using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

/// <summary>
/// After pickup/delivery completion (Order.PickedUpAt) and a delay, send one customer receipt email (not a Stripe invoice).
/// </summary>
public sealed class OrderCompletionReceiptHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OrderCompletionReceiptHostedService> _logger;

    public OrderCompletionReceiptHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<OrderCompletionReceiptHostedService> logger)
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
                    _logger.LogError(ex, "[CompletionReceipt] Scheduled run failed");
                }
        }
    }

    private async Task RunOnceAsync(CancellationToken stoppingToken)
    {
        var days = Math.Clamp(_configuration.GetValue("Invoice:DaysAfterCompletion", 2), 0, 30);
        var cutoff = DateTime.UtcNow.AddDays(-days);

        string storeName;
        string? abn;
        string? storePhone;
        string storeAddress;
        List<int> orderIds;

        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var store = await db.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync(stoppingToken);
            storeName = string.IsNullOrWhiteSpace(store?.StoreName) ? "IGA Beverly Hills" : store!.StoreName.Trim();
            abn = store?.AbnNumber?.Trim();
            storePhone = store?.PhoneNumber?.Trim();
            storeAddress = _configuration["Store:PickupAddress"]?.Trim() ?? "IGA Beverly Hills";

            orderIds = await db.Orders
                .AsNoTracking()
                .Where(o =>
                    (o.OrderStatus == "Prepared" || o.OrderStatus == "Completed")
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
            await TrySendForOrderAsync(orderId, days, storeName, abn, storePhone, storeAddress, stoppingToken);
        }
    }

    private async Task TrySendForOrderAsync(
        int orderId,
        int daysAfterCompletion,
        string storeName,
        string? abn,
        string? storePhone,
        string storeAddress,
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
            || !IsCompletedForReceipt(order)
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
            _logger.LogInformation("[CompletionReceipt] Skipped order {OrderId}: no usable customer email", orderId);
            return;
        }

        var sent = false;

        {
            var lines = (order.Items ?? new List<OrderItem>())
                .Select(i => (
                    ProductName: i.ProductName ?? $"Item #{i.Id}",
                    Quantity: i.Quantity,
                    UnitPrice: i.PriceAtPurchase,
                    LineTotal: ComputeLineTotal(i),
                    ExpectedWeight: i.ExpectedWeight,
                    ActualWeight: i.ActualWeight))
                .ToList();

            var pickedUpUtc = order.PickedUpAt!.Value;
            var customerName = string.IsNullOrWhiteSpace(order.User.Name) ? "Customer" : order.User.Name.Trim();
            sent = await resend.SendOrderCompletionReceiptAsync(
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
                storePhone,
                storeAddress,
                ct);

            if (!sent)
            {
                await tx.RollbackAsync(ct);
                _logger.LogWarning("[CompletionReceipt] Receipt email failed for order {OrderId}; will retry later", orderId);
                return;
            }
        }

        order.CompletionInvoiceSentAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        _logger.LogInformation(
            "[CompletionReceipt] Sent receipt for order {OrderId} ({Channel})",
            orderId,
            "Resend");
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

    private static bool IsCompletedForReceipt(Order order) =>
        string.Equals(order.OrderStatus, "Prepared", StringComparison.OrdinalIgnoreCase)
        || string.Equals(order.OrderStatus, "Completed", StringComparison.OrdinalIgnoreCase);
}
