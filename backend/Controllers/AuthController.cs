using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Linq;
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

        /// <summary>注册：仅写入待验证表 <see cref="PendingRegistration"/>，验证通过后才创建 <see cref="User"/>。</summary>
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Name, Email and Password are required");

            var email = request.Email.Trim();

            // Reject if a fully verified account already exists for this email
            if (await _context.Users.AnyAsync(u => u.Email == email && u.EmailVerified))
                return BadRequest("Email already registered");

            var code = Random.Shared.Next(100000, 1000000).ToString("D6");
            var codeHash = HashVerificationCode(email, code);
            var expires = DateTime.UtcNow.AddMinutes(15);

            // If a pending registration already exists, update it instead of creating a duplicate
            var pending = await _context.PendingRegistrations.FindAsync(email);
            if (pending != null)
            {
                pending.Name = request.Name.Trim();
                pending.PasswordHash = HashPassword(request.Password);
                pending.VerificationCodeHash = codeHash;
                pending.ExpiresUtc = expires;
            }
            else
            {
                _context.PendingRegistrations.Add(new PendingRegistration
                {
                    Email = email,
                    Name = request.Name.Trim(),
                    PasswordHash = HashPassword(request.Password),
                    VerificationCodeHash = codeHash,
                    ExpiresUtc = expires,
                });
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

            // NOTE: At this point the user is NOT yet registered. Registration is only complete
            // after the email verification code is submitted and a User record is created.
            return Ok(new
            {
                status = "PendingVerification",
                message = sent
                    ? "Verification code sent to your email. You are not yet registered — please verify your email to complete registration."
                    : "Pending email verification, but the confirmation email could not be sent. Check server logs or configure Resend.",
                emailSent = sent,
                email,
            });
        }

        /// <summary>提交邮箱验证码，通过后首次写入 <see cref="User"/>（已验证）。</summary>
        [HttpPost("verify-email")]
        public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Code))
                return BadRequest("Email and Code are required");

            var email = request.Email.Trim();
            if (await _context.Users.AnyAsync(u => u.Email == email && u.EmailVerified))
                return Ok(new { message = "Email already verified" });

            var pending = await _context.PendingRegistrations.FindAsync(email);
            if (pending == null)
                return BadRequest("No pending registration. Please register again.");

            if (pending.ExpiresUtc < DateTime.UtcNow)
                return BadRequest("Verification code expired. Request a new code.");

            var codeDigits = new string((request.Code ?? "").Where(char.IsDigit).ToArray());
            if (codeDigits.Length != 6)
                return BadRequest("Invalid verification code");

            var inputHash = HashVerificationCode(email, codeDigits);
            if (pending.VerificationCodeHash != inputHash)
                return BadRequest("Invalid verification code");

            var user = new User
            {
                Name = pending.Name,
                Email = email,
                PhoneNumber = null,
                PasswordHash = pending.PasswordHash,
                Role = "Customer",
                EmailVerified = true,
                EmailVerificationCodeHash = null,
                EmailVerificationExpiresUtc = null,
            };
            _context.Users.Add(user);
            _context.PendingRegistrations.Remove(pending);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                status = "Registered",
                message = "Registration complete. Your email has been verified and you can now sign in.",
            });
        }

        /// <summary>重新发送验证码（仅待验证注册 <see cref="PendingRegistration"/>）。</summary>
        [HttpPost("resend-verification")]
        public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest("Email is required");

            var email = request.Email.Trim();

            // Resend only works for pending (unverified) registrations
            if (await _context.Users.AnyAsync(u => u.Email == email && u.EmailVerified))
                return BadRequest("This email is already fully registered. No verification needed.");

            var pending = await _context.PendingRegistrations.FindAsync(email);
            if (pending == null)
                return Ok(new { emailSent = false, message = "No pending registration found for this email. Please register first." });

            var code = Random.Shared.Next(100000, 1000000).ToString("D6");
            pending.VerificationCodeHash = HashVerificationCode(email, code);
            pending.ExpiresUtc = DateTime.UtcNow.AddMinutes(15);
            await _context.SaveChangesAsync();

            var sent = await _resendEmail.SendRegistrationVerificationAsync(email, pending.Name, code);
            if (!sent)
                _logger.LogWarning("[Auth] 重发验证码失败。邮箱: {Email} 验证码: {Code}", email, code);

            return Ok(new { emailSent = sent, message = sent ? "Verification code resent. Check your email to complete registration." : "Could not send email. Check logs." });
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
