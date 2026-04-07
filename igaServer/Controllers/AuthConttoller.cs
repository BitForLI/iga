using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using igaServer.Data;
using igaServer.Models;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public AuthController(ApplicationDbContext context)
        {
            _context = context;
        }

        // ==========================================
        // 1. 用户注册
        // POST: api/auth/register
        // ==========================================
        [HttpPost("register")]
        public async Task<ActionResult<User>> Register(RegisterRequest request)
        {
            // 1. 检查邮箱是否已被注册
            if (await _context.Users.AnyAsync(u => u.Email == request.Email))
            {
                return BadRequest("Email already registered");
            }

            // 2. 创建用户对象 (密码加密)
            var user = new User
            {
                Name = request.Name,
                Email = request.Email,
                PhoneNumber = request.PhoneNumber, // 👈 添加电话号码
                PasswordHash = HashPassword(request.Password) // 🔐 核心：密码加密
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Registered successfully", userId = user.Id });
        }

        // ==========================================
        // 2. 用户登录
        // POST: api/auth/login
        // ==========================================
        [HttpPost("login")]
        public async Task<ActionResult<User>> Login(LoginRequest request)
        {
            // 1. 查找用户
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == request.Email);

            if (user == null)
            {
                return BadRequest("User not found");
            }

            // 2. 验证密码 (将输入的密码加密后，和数据库里的比对)
            if (user.PasswordHash != HashPassword(request.Password))
            {
                return BadRequest("Invalid password");
            }

            // 3. 登录成功，返回用户信息（含 role，供前端判断是否管理员）
            return Ok(new 
            { 
                id = user.Id, 
                name = user.Name, 
                email = user.Email, 
                phoneNumber = user.PhoneNumber,
                role = user.Role ?? "Customer"
            });
        }

        // ==========================================
        // 🔐 辅助方法：SHA256 简易加密
        // ==========================================
        private string HashPassword(string password)
        {
            using (var sha256 = SHA256.Create())
            {
                var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
                return BitConverter.ToString(hashedBytes).Replace("-", "").ToLower();
            }
        }
    }

    // ==========================================
    // 📦 DTO (数据传输对象)
    // 为了不把 User 数据库模型直接暴露给前端，我们定义这两个小类来接收参数
    // ==========================================
    public class RegisterRequest
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public string PhoneNumber { get; set; }
        public string Password { get; set; }
        public string? Role { get; set; } // "Admin" 或 "Customer"
    }

    public class LoginRequest
    {
        public string Email { get; set; }
        public string Password { get; set; }
    }
}