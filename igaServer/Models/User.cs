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

        [Required]
        public string PhoneNumber { get; set; } // 核心：用于截取后四位作为取货码

        public string PasswordHash { get; set; } // 加密后的密码

        public string Role { get; set; } = "Customer"; // Customer | Admin | Staff（员工仅订单备货）

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow; 
    }
}