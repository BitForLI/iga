using System.ComponentModel.DataAnnotations;

namespace igaServer.Models;

public class AdminAuditLog
{
    public long Id { get; set; }
    public int ActorUserId { get; set; }
    [StringLength(20)] public string ActorRole { get; set; } = string.Empty;
    [StringLength(100)] public string Action { get; set; } = string.Empty;
    [StringLength(40)] public string ResourceType { get; set; } = string.Empty;
    [StringLength(100)] public string ResourceId { get; set; } = string.Empty;
    [StringLength(500)] public string? Details { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
