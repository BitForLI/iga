using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using igaServer.Data;

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

        List<int> orderIds;

        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
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
            using var scope = _scopeFactory.CreateScope();
            var sender = scope.ServiceProvider.GetRequiredService<IOrderCompletionReceiptSender>();
            var sent = await sender.TrySendForOrderAsync(
                orderId,
                TimeSpan.FromDays(days),
                stoppingToken);
            if (!sent)
            {
                _logger.LogDebug("[CompletionReceipt] Order {OrderId} not sent in scheduled run", orderId);
            }
        }
    }
}
