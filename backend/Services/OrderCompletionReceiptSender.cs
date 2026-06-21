using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

public sealed class OrderCompletionReceiptSender : IOrderCompletionReceiptSender
{
    private readonly ApplicationDbContext _db;
    private readonly IResendEmailService _resend;
    private readonly IConfiguration _configuration;
    private readonly ILogger<OrderCompletionReceiptSender> _logger;

    public OrderCompletionReceiptSender(
        ApplicationDbContext db,
        IResendEmailService resend,
        IConfiguration configuration,
        ILogger<OrderCompletionReceiptSender> logger)
    {
        _db = db;
        _resend = resend;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<bool> TrySendForOrderAsync(
        int orderId,
        TimeSpan minimumAgeAfterCompletion,
        CancellationToken cancellationToken = default)
    {
        await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);
        var order = await _db.Orders
            .Include(o => o.User)
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken);

        if (order?.User == null
            || !IsCompletedForReceipt(order)
            || !order.PickedUpAt.HasValue
            || order.CompletionInvoiceSentAt != null)
        {
            await tx.RollbackAsync(cancellationToken);
            return false;
        }

        if (DateTime.UtcNow - order.PickedUpAt.Value < minimumAgeAfterCompletion)
        {
            await tx.RollbackAsync(cancellationToken);
            return false;
        }

        var email = (order.User.Email ?? "").Trim();
        if (string.IsNullOrEmpty(email)
            || !email.Contains('@', StringComparison.Ordinal)
            || email.EndsWith("@iga.local", StringComparison.OrdinalIgnoreCase))
        {
            order.CompletionInvoiceSentAt = DateTime.UtcNow; // 避免永久重试无效邮箱
            await _db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
            _logger.LogInformation("[CompletionReceipt] Skipped order {OrderId}: no usable customer email", orderId);
            return false;
        }

        var store = await _db.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync(cancellationToken);
        var storeName = string.IsNullOrWhiteSpace(store?.StoreName) ? "IGA Beverly Hills" : store!.StoreName.Trim();
        var abn = store?.AbnNumber?.Trim();
        var storePhone = store?.PhoneNumber?.Trim();
        var storeAddress = store?.StoreAddress?.Trim();
        if (string.IsNullOrWhiteSpace(storeAddress))
            storeAddress = _configuration["Store:PickupAddress"]?.Trim() ?? "IGA Beverly Hills";

        var lines = (order.Items ?? new List<OrderItem>())
            .Select(i => (
                ProductName: i.ProductName ?? $"Item #{i.Id}",
                Quantity: i.Quantity,
                UnitPrice: i.PriceAtPurchase,
                LineTotal: ComputeLineTotal(i),
                ExpectedWeight: i.ExpectedWeight,
                ActualWeight: i.ActualWeight))
            .ToList();

        var customerName = string.IsNullOrWhiteSpace(order.User.Name) ? "Customer" : order.User.Name.Trim();
        var sent = await _resend.SendOrderCompletionReceiptAsync(
            email,
            customerName,
            order.Id,
            order.OrderType ?? "Pickup",
            order.PickedUpAt.Value,
            order.TotalAmount,
            order.FinalAmount,
            order.DeliveryAddress,
            lines,
            storeName,
            abn,
            storePhone,
            storeAddress,
            cancellationToken);

        if (!sent)
        {
            await tx.RollbackAsync(cancellationToken);
            _logger.LogWarning("[CompletionReceipt] Receipt email failed for order {OrderId}; will retry later", orderId);
            return false;
        }

        order.CompletionInvoiceSentAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        _logger.LogInformation("[CompletionReceipt] Sent receipt for order {OrderId} (Resend)", orderId);
        return true;
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

    private static bool IsCompletedForReceipt(Order order) =>
        string.Equals(order.OrderStatus, "Prepared", StringComparison.OrdinalIgnoreCase)
        || string.Equals(order.OrderStatus, "Completed", StringComparison.OrdinalIgnoreCase);
}
