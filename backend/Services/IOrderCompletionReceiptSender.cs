namespace IGA.Services;

public interface IOrderCompletionReceiptSender
{
    Task<bool> TrySendForOrderAsync(
        int orderId,
        TimeSpan minimumAgeAfterCompletion,
        CancellationToken cancellationToken = default);
}
