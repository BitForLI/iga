using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using IGA.Services;
using igaServer.Data;
using igaServer.Models;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IResendEmailService _resendEmail;
        private readonly ILogger<AuthController> _logger;

        public AuthController(
            ApplicationDbContext context,
            IResendEmailService resendEmail,
            ILogger<AuthController> logger)
        {
            _context = context;
            _resendEmail = resendEmail;
            _logger = logger;
        }

        /// <summary>注册：创建未验证账号并发送邮箱验证码（不含手机号）。</summary>
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Name, Email and Password are required");

            var email = request.Email.Trim();
            var existing = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);

            if (existing != null && existing.EmailVerified)
                return BadRequest("Email already registered");

            var code = Random.Shared.Next(100000, 1000000).ToString("D6");
            var codeHash = HashVerificationCode(email, code);
            var expires = DateTime.UtcNow.AddMinutes(15);

            if (existing != null)
            {
                existing.Name = request.Name.Trim();
                existing.PasswordHash = HashPassword(request.Password);
                existing.EmailVerificationCodeHash = codeHash;
                existing.EmailVerificationExpiresUtc = expires;
            }
            else
            {
                var user = new User
                {
                    Name = request.Name.Trim(),
                    Email = email,
                    PhoneNumber = null,
                    PasswordHash = HashPassword(request.Password),
                    EmailVerified = false,
                    EmailVerificationCodeHash = codeHash,
                    EmailVerificationExpiresUtc = expires,
                };
                _context.Users.Add(user);
            }

            await _context.SaveChangesAsync();

            var sent = await _resendEmail.SendRegistrationVerificationAsync(email, request.Name.Trim(), code);

            if (!sent)
            {
                _logger.LogWarning(
                    "[Auth] 注册验证码邮件未发出（Resend 未配置或失败）。开发环境可在控制台查找日志。邮箱: {Email} 验证码: {Code}",
                    email,
                    code);
            }

            return Ok(new
            {
                message = sent
                    ? "Verification code sent to your email."
                    : "Account created but email could not be sent. Check server logs or configure Resend.",
                emailSent = sent,
                email,
            });
        }

        /// <summary>提交邮箱验证码，通过后方可登录。</summary>
        [HttpPost("verify-email")]
        public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Code))
                return BadRequest("Email and Code are required");

            var email = request.Email.Trim();
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
            if (user == null)
                return BadRequest("User not found");

            if (user.EmailVerified)
                return Ok(new { message = "Email already verified" });

            if (user.EmailVerificationExpiresUtc == null || user.EmailVerificationExpiresUtc < DateTime.UtcNow)
                return BadRequest("Verification code expired. Request a new code.");

            var inputHash = HashVerificationCode(email, request.Code.Trim());
            if (user.EmailVerificationCodeHash != inputHash)
                return BadRequest("Invalid verification code");

            user.EmailVerified = true;
            user.EmailVerificationCodeHash = null;
            user.EmailVerificationExpiresUtc = null;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Email verified. You can sign in now." });
        }

        /// <summary>重新发送验证码（未验证账号）。</summary>
        [HttpPost("resend-verification")]
        public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest("Email is required");

            var email = request.Email.Trim();
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
            if (user == null)
                return Ok(new { message = "If an account exists, a code will be sent." });

            if (user.EmailVerified)
                return BadRequest("Email already verified");

            var code = Random.Shared.Next(100000, 1000000).ToString("D6");
            user.EmailVerificationCodeHash = HashVerificationCode(email, code);
            user.EmailVerificationExpiresUtc = DateTime.UtcNow.AddMinutes(15);
            await _context.SaveChangesAsync();

            var sent = await _resendEmail.SendRegistrationVerificationAsync(email, user.Name, code);
            if (!sent)
                _logger.LogWarning("[Auth] 重发验证码失败。邮箱: {Email} 验证码: {Code}", email, code);

            return Ok(new { emailSent = sent, message = sent ? "Code sent." : "Could not send email. Check logs." });
        }

        [HttpPost("login")]
        public async Task<ActionResult<object>> Login([FromBody] LoginRequest? request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Email and Password are required");

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == request.Email);

            if (user == null)
                return BadRequest("User not found");

            if (!user.EmailVerified)
                return BadRequest("Please verify your email before signing in.");

            if (user.PasswordHash != HashPassword(request.Password))
                return BadRequest("Invalid password");

            return Ok(new
            {
                id = user.Id,
                name = user.Name,
                email = user.Email,
                phoneNumber = user.PhoneNumber ?? "",
                role = user.Role ?? "Customer",
            });
        }

        private static string HashPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
            return BitConverter.ToString(hashedBytes).Replace("-", "").ToLowerInvariant();
        }

        private static string HashVerificationCode(string email, string code)
        {
            var raw = $"{email.Trim().ToLowerInvariant()}:{code.Trim()}";
            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(raw));
            return BitConverter.ToString(hashedBytes).Replace("-", "").ToLowerInvariant();
        }
    }

    public class RegisterRequest
    {
        public string? Name { get; set; }
        public string? Email { get; set; }
        public string? Password { get; set; }
    }

    public class VerifyEmailRequest
    {
        public string? Email { get; set; }
        public string? Code { get; set; }
    }

    public class ResendVerificationRequest
    {
        public string? Email { get; set; }
    }

    public class LoginRequest
    {
        public string? Email { get; set; }
        public string? Password { get; set; }
    }
}
