using igaServer.Models;

namespace IGA.Services;

/// <summary>
/// 通过 Telegram Bot 向商家发送通知（新订单等）。需在配置中设置 Bot Token，并配置 ChatId（环境变量或 StoreConfigs.TelegramChatId）。
/// </summary>
public interface ITelegramNotificationService
{
    /// <summary>顾客提交新订单（待支付）时调用；未配置 Token/Chat 时静默跳过。</summary>
    Task NotifyNewOrderCreatedAsync(Order order, User user, CancellationToken cancellationToken = default);
}
