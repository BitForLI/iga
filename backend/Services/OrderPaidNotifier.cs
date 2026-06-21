using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using igaServer.Data;
using igaServer.Models;

namespace IGA.Services;

/// <summary>订单标记为已支付后发送取件码邮件（非 guest、需可投递邮箱）。</summary>
public static class OrderPaidNotifier
{
    public static async Task TryNotifyPickupEmailAsync(
        ApplicationDbContext db,
        IResendEmailService resend,
        int orderId,
        ILogger logger,
        string? paymentContactEmail = null,
        string? pickupAddress = null,
        CancellationToken cancellationToken = default)
    {
        var order = await db.Orders
            .Include(o => o.User)
            .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken);

        if (order?.User == null)
        {
            logger.LogWarning("[OrderPaid] Order {OrderId} or user missing", orderId);
            return;
        }

        var addr = ChooseCustomerEmail(paymentContactEmail, order.User.Email);
        if (string.IsNullOrEmpty(addr) || addr.EndsWith("@iga.local", StringComparison.OrdinalIgnoreCase))
            return;

        var name = order.User.Name ?? "Customer";
        var code = order.PickupCode ?? "";
        var ok = await resend.SendOrderPaidPickupAsync(
            addr,
            name,
            order.Id,
            code,
            order.OrderType ?? "Pickup",
            order.PickupTime,
            order.DeliveryAddress,
            pickupAddress,
            cancellationToken);

        if (ok)
            logger.LogInformation("[OrderPaid] Pickup email sent for order {OrderId}", orderId);

        if (order.CompletionInvoiceSentAt != null)
            return;

        var store = await db.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync(cancellationToken);
        var storeName = string.IsNullOrWhiteSpace(store?.StoreName) ? "BEVERLY HILLS" : store!.StoreName.Trim();
        var abn = store?.AbnNumber?.Trim();
        var storePhone = store?.PhoneNumber?.Trim();
        var storeAddress = store?.StoreAddress?.Trim() ?? pickupAddress ?? "22-26 TOORONGA TCE";

        var lines = await db.OrderItems
            .AsNoTracking()
            .Where(i => i.OrderId == orderId)
            .OrderBy(i => i.Id)
            .Select(i => new
            {
                i.ProductName,
                i.Quantity,
                i.PriceAtPurchase,
                i.ExpectedWeight,
                i.ActualWeight,
            })
            .ToListAsync(cancellationToken);

        if (lines.Count == 0)
            return;

        var receiptOk = await resend.SendOrderCompletionReceiptAsync(
            addr,
            name,
            order.Id,
            order.OrderType ?? "Pickup",
            DateTime.UtcNow,
            order.TotalAmount,
            order.FinalAmount,
            order.DeliveryAddress,
            lines.Select(i => (
                ProductName: i.ProductName ?? $"Item #{orderId}",
                Quantity: i.Quantity,
                UnitPrice: i.PriceAtPurchase,
                LineTotal: ComputeLineTotal(i.Quantity, i.PriceAtPurchase, i.ExpectedWeight, i.ActualWeight),
                ExpectedWeight: i.ExpectedWeight,
                ActualWeight: i.ActualWeight)).ToList(),
            storeName,
            abn,
            storePhone,
            storeAddress,
            cancellationToken);

        if (!receiptOk)
            return;

        order.CompletionInvoiceSentAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("[OrderPaid] Tax invoice sent for order {OrderId}", orderId);
    }

    private static decimal ComputeLineTotal(int quantity, decimal priceAtPurchase, double expectedWeight, double? actualWeight)
    {
        if (expectedWeight > 0)
        {
            var w = actualWeight ?? expectedWeight;
            if (w > 0)
                return Math.Round(priceAtPurchase * (decimal)w, 2, MidpointRounding.AwayFromZero);
        }

        return Math.Round(priceAtPurchase * quantity, 2, MidpointRounding.AwayFromZero);
    }

    private static string? ChooseCustomerEmail(string? paymentContactEmail, string? registeredEmail)
    {
        var paymentEmail = paymentContactEmail?.Trim();
        if (!string.IsNullOrWhiteSpace(paymentEmail) && paymentEmail.Contains('@'))
            return paymentEmail;

        return registeredEmail?.Trim();
    }
}
