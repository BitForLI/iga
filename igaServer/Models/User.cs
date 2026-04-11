using System.ComponentModel.DataAnnotations;

namespace igaServer.Models
{
    public class User
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string Name { get; set; } // 登录名

        [EmailAddress]
        public string Email { get; set; }

        /// <summary>可选；取件码不再依赖手机号。</summary>
        public string? PhoneNumber { get; set; }

        public string PasswordHash { get; set; } // 加密后的密码

        public string Role { get; set; } = "Customer"; // Customer | Admin | Staff（员工仅订单备货）

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>邮箱验证码通过并登录前为 false。</summary>
        public bool EmailVerified { get; set; }

        public string? EmailVerificationCodeHash { get; set; }

        public DateTime? EmailVerificationExpiresUtc { get; set; }
    }
}