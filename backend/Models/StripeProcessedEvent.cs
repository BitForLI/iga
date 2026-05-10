using System.ComponentModel.DataAnnotations;

namespace igaServer.Models;

/// <summary>已处理的 Stripe Webhook 事件（evt_...），用于幂等与防重复投递。</summary>
public class StripeProcessedEvent
{
    [Key]
    [MaxLength(128)]
    public string Id { get; set; } = string.Empty;

    public DateTime ProcessedAtUtc { get; set; } = DateTime.UtcNow;
}
