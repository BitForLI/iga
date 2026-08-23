using igaServer.Data;
using System.Security.Claims;

namespace igaServer.Utils;

/// <summary>Backoffice authorization derived only from the validated bearer-token principal.</summary>
public static class BackofficeAuthHelper
{
    public static async Task<(bool Ok, string Role)> GetUserRoleAsync(HttpRequest request, ApplicationDbContext db)
    {
        await Task.CompletedTask;
        var principal = request.HttpContext.User;
        if (principal.Identity?.IsAuthenticated != true ||
            !int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out _))
            return (false, string.Empty);
        return (true, principal.FindFirstValue(ClaimTypes.Role) ?? "Customer");
    }

    public static bool IsAdmin(string role) => string.Equals(role?.Trim(), "Admin", StringComparison.OrdinalIgnoreCase);

    public static bool IsStaffOrAdmin(string role) =>
        IsAdmin(role) || string.Equals(role?.Trim(), "Staff", StringComparison.OrdinalIgnoreCase);
}
