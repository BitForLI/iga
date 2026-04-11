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

        var addr = order.User.Email?.Trim();
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
            cancellationToken);

        if (ok)
            logger.LogInformation("[OrderPaid] Pickup email sent for order {OrderId}", orderId);
    }
}
