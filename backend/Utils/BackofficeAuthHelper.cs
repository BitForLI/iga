using Microsoft.EntityFrameworkCore;
using igaServer.Data;

namespace igaServer.Utils;

/// <summary>后台接口：通过请求头 X-User-Id 查库校验角色（与前端登录用户一致）。</summary>
public static class BackofficeAuthHelper
{
    public static async Task<(bool Ok, string Role)> GetUserRoleAsync(HttpRequest request, ApplicationDbContext db)
    {
        if (!request.Headers.TryGetValue("X-User-Id", out var idStr) || !int.TryParse(idStr, out var userId))
            return (false, "");

        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            return (false, "");

        return (true, string.IsNullOrEmpty(user.Role) ? "Customer" : user.Role);
    }

    public static bool IsAdmin(string role) => role == "Admin";

    public static bool IsStaffOrAdmin(string role) => role == "Admin" || role == "Staff";
}
