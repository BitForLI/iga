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

        /// <summary>Register: writes only to <see cref="PendingRegistration"/> until email is verified, then creates <see cref="User"/>.</summary>
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Name, Email and Password are required");

            var email = NormalizeEmail(request.Email);

            // Reject if a fully verified account already exists for this email
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email && u.EmailVerified))
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
                    "[Auth] Registration verification email was not sent (Resend missing or failed). In development, check logs for the code. Email: {Email} Code: {Code}",
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

        /// <summary>Submit email verification code; on success creates verified <see cref="User"/>.</summary>
        [HttpPost("verify-email")]
        public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Code))
                return BadRequest("Email and Code are required");

            var email = NormalizeEmail(request.Email);
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email && u.EmailVerified))
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

        /// <summary>Resend verification code for pending <see cref="PendingRegistration"/> only.</summary>
        [HttpPost("resend-verification")]
        public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest("Email is required");

            var email = NormalizeEmail(request.Email);

            // Resend only works for pending (unverified) registrations
            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email && u.EmailVerified))
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
                _logger.LogWarning("[Auth] Failed to resend verification email. Email: {Email} Code: {Code}", email, code);

            return Ok(new { emailSent = sent, message = sent ? "Verification code resent. Check your email to complete registration." : "Could not send email. Check logs." });
        }

        [HttpPost("login")]
        public async Task<ActionResult<object>> Login([FromBody] LoginRequest? request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Email and Password are required");

            var email = NormalizeEmail(request.Email);
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Email.ToLower() == email);

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

        private const string PasswordResetUserMessage =
            "If an account exists for this email, a verification code has been sent. It expires in 15 minutes.";

        /// <summary>Sends a 6-digit code to verified accounts for password reset. Unknown emails get the same response to avoid enumeration.</summary>
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest("Email is required");

            var email = NormalizeEmail(request.Email);
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
            if (user != null && user.EmailVerified)
            {
                var code = Random.Shared.Next(100000, 1000000).ToString("D6");
                user.EmailVerificationCodeHash = HashPasswordResetCode(email, code);
                user.EmailVerificationExpiresUtc = DateTime.UtcNow.AddMinutes(15);
                await _context.SaveChangesAsync();

                var sent = await _resendEmail.SendPasswordResetVerificationAsync(email, user.Name, code);
                if (!sent)
                    _logger.LogWarning("[Auth] Password reset verification email was not sent. Email: {Email} Code: {Code}", email, code);
            }

            return Ok(new { message = PasswordResetUserMessage });
        }

        /// <summary>Resend password-reset code (same behaviour as forgot-password).</summary>
        [HttpPost("resend-password-reset")]
        public Task<IActionResult> ResendPasswordReset([FromBody] ForgotPasswordRequest? request) =>
            ForgotPassword(request);

        /// <summary>Validates email code and updates the sign-in password.</summary>
        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest? request)
        {
            if (request == null)
                return BadRequest("Invalid JSON body");
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.NewPassword))
                return BadRequest("Email and new password are required");

            var email = NormalizeEmail(request.Email);
            if (request.NewPassword.Length < 6)
                return BadRequest("New password must be at least 6 characters.");

            var codeDigits = new string((request.Code ?? "").Where(char.IsDigit).ToArray());
            if (codeDigits.Length != 6)
                return BadRequest("Invalid verification code");

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
            if (user == null || !user.EmailVerified || string.IsNullOrEmpty(user.EmailVerificationCodeHash) ||
                !user.EmailVerificationExpiresUtc.HasValue)
                return BadRequest("Invalid or expired verification code.");

            if (user.EmailVerificationExpiresUtc.Value < DateTime.UtcNow)
                return BadRequest("Invalid or expired verification code.");

            var inputHash = HashPasswordResetCode(email, codeDigits);
            if (user.EmailVerificationCodeHash != inputHash)
                return BadRequest("Invalid or expired verification code.");

            user.PasswordHash = HashPassword(request.NewPassword);
            user.EmailVerificationCodeHash = null;
            user.EmailVerificationExpiresUtc = null;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Password has been updated. You can sign in now." });
        }

        private static string HashPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
            return BitConverter.ToString(hashedBytes).Replace("-", "").ToLowerInvariant();
        }

        private static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();

        private static string HashVerificationCode(string email, string code)
        {
            var raw = $"{email.Trim().ToLowerInvariant()}:{code.Trim()}";
            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(raw));
            return BitConverter.ToString(hashedBytes).Replace("-", "").ToLowerInvariant();
        }

        /// <summary>Hash for password-reset codes; distinct from registration verification to avoid collisions.</summary>
        private static string HashPasswordResetCode(string email, string code)
        {
            var raw = $"pwreset:v1|{email.Trim().ToLowerInvariant()}|{code.Trim()}";
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

    public class ForgotPasswordRequest
    {
        public string? Email { get; set; }
    }

    public class ResetPasswordRequest
    {
        public string? Email { get; set; }
        public string? Code { get; set; }
        public string? NewPassword { get; set; }
    }
}
