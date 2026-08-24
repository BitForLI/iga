using System.Security.Claims;
using igaServer.Data;
using igaServer.Models;

namespace igaServer.Utils;

public static class AdminAuditLogHelper
{
    public static void Add(ApplicationDbContext db, ClaimsPrincipal actor, string action, string resourceType, object resourceId, string? details = null)
    {
        if (!int.TryParse(actor.FindFirstValue(ClaimTypes.NameIdentifier), out var actorUserId)) return;
        var role = actor.FindFirstValue(ClaimTypes.Role) ?? "Unknown";
        var id = resourceId.ToString() ?? string.Empty;
        db.AdminAuditLogs.Add(new AdminAuditLog
        {
            ActorUserId = actorUserId,
            ActorRole = role[..Math.Min(role.Length, 20)],
            Action = action[..Math.Min(action.Length, 100)],
            ResourceType = resourceType[..Math.Min(resourceType.Length, 40)],
            ResourceId = id[..Math.Min(id.Length, 100)],
            Details = string.IsNullOrWhiteSpace(details) ? null : details[..Math.Min(details.Length, 500)],
        });
    }
}
