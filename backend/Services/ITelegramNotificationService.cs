using igaServer.Models;

namespace IGA.Services;

/// <summary>
/// Sends merchant notifications via Telegram Bot. Configure Bot Token and ChatId (env or StoreConfigs.TelegramChatId).
/// </summary>
public interface ITelegramNotificationService
{
    /// <summary>Called after the order is marked paid (webhook / sync). Includes packing hints; no-op if not configured.</summary>
    Task NotifyOrderPaidAsync(int orderId, CancellationToken cancellationToken = default);
}
