using System.ComponentModel.DataAnnotations;

namespace igaServer.Models;

/// <summary>
/// 未完成邮箱验证的注册数据；验证通过后写入 <see cref="User"/> 并删除本条。
/// </summary>
public class PendingRegistration
{
    [Key]
    [MaxLength(256)]
    public string Email { get; set; } = "";

    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = "";

    [Required]
    public string PasswordHash { get; set; } = "";

    [Required]
    public string VerificationCodeHash { get; set; } = "";

    public DateTime ExpiresUtc { get; set; }
}
