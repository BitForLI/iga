using System.IdentityModel.Tokens.Jwt;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using igaServer.Data;
using igaServer.Models;
using IGA.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace igaServer.Controllers;

[Route("api/[controller]")]
[ApiController]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private const string PasswordResetUserMessage =
        "If an account exists for this email, a verification code has been sent. It expires in 15 minutes.";
    private const string RegistrationUserMessage =
        "If this email can be registered, a verification code has been sent. It expires in 15 minutes.";

    private readonly ApplicationDbContext _context;
    private readonly IResendEmailService _resendEmail;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthController> _logger;

    public AuthController(ApplicationDbContext context, IResendEmailService resendEmail,
        IPasswordHasher<User> passwordHasher, IConfiguration configuration, ILogger<AuthController> logger)
    {
        _context = context;
        _resendEmail = resendEmail;
        _passwordHasher = passwordHasher;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest? request)
    {
        if (request == null) return BadRequest(new { error = "Invalid JSON body" });
        var name = (request.Name ?? "").Trim();
        var email = NormalizeEmail(request.Email);
        var password = request.Password ?? "";
        if (name.Length is < 1 or > 100 || !IsValidEmail(email))
            return BadRequest(new { error = "Enter a valid name and email." });
        if (password.Length is < 12 or > 128)
            return BadRequest(new { error = "Password must be 12-128 characters." });
        // Perform the expensive password hashing before the account lookup so the response does
        // not provide an obvious fast-path timing signal for already registered addresses.
        var passwordHash = _passwordHasher.HashPassword(new User { Email = email, Name = name }, password);
        if (await _context.Users.AnyAsync(u => u.Email.ToLower() == email))
        {
            return Ok(new
            {
                status = "PendingVerification",
                message = RegistrationUserMessage,
                emailSent = true,
                email,
            });
        }

        var code = GenerateSixDigitCode();
        var pending = await _context.PendingRegistrations.FindAsync(email);
        if (pending == null)
        {
            pending = new PendingRegistration { Email = email };
            _context.PendingRegistrations.Add(pending);
        }
        pending.Name = name;
        pending.PasswordHash = passwordHash;
        pending.VerificationCodeHash = HashCode("register", email, code);
        pending.ExpiresUtc = DateTime.UtcNow.AddMinutes(15);
        await _context.SaveChangesAsync();

        var sent = await _resendEmail.SendRegistrationVerificationAsync(email, name, code);
        if (!sent) _logger.LogWarning("[Auth] Registration verification email delivery failed for {Email}", email);
        return Ok(new
        {
            status = "PendingVerification",
            message = RegistrationUserMessage,
            emailSent = true,
            email,
        });
    }

    [HttpPost("verify-email")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest? request)
    {
        var email = NormalizeEmail(request?.Email);
        var code = NormalizeSixDigitCode(request?.Code);
        if (!IsValidEmail(email) || code == null)
            return BadRequest(new { error = "Invalid or expired verification code." });
        var pending = await _context.PendingRegistrations.FindAsync(email);
        if (pending == null || pending.ExpiresUtc < DateTime.UtcNow ||
            !SecureHashEquals(pending.VerificationCodeHash, HashCode("register", email, code)))
            return BadRequest(new { error = "Invalid or expired verification code." });

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
        if (user == null)
        {
            user = new User { Email = email, Name = pending.Name, PasswordHash = pending.PasswordHash };
            _context.Users.Add(user);
        }
        user.Name = pending.Name;
        user.PasswordHash = pending.PasswordHash;
        user.Role = "Customer";
        user.EmailVerified = true;
        user.EmailVerificationCodeHash = null;
        user.EmailVerificationExpiresUtc = null;
        _context.PendingRegistrations.Remove(pending);
        await _context.SaveChangesAsync();
        return Ok(new { status = "Registered", message = "Registration complete. You can now sign in." });
    }

    [HttpPost("resend-verification")]
    [AllowAnonymous]
    public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationRequest? request)
    {
        var email = NormalizeEmail(request?.Email);
        if (!IsValidEmail(email)) return BadRequest(new { error = "Enter a valid email." });
        var pending = await _context.PendingRegistrations.FindAsync(email);
        if (pending == null)
            return Ok(new { emailSent = false, message = "If registration is pending, a new code will be sent." });
        var code = GenerateSixDigitCode();
        pending.VerificationCodeHash = HashCode("register", email, code);
        pending.ExpiresUtc = DateTime.UtcNow.AddMinutes(15);
        await _context.SaveChangesAsync();
        var sent = await _resendEmail.SendRegistrationVerificationAsync(email, pending.Name, code);
        if (!sent) _logger.LogWarning("[Auth] Verification email delivery failed for {Email}", email);
        return Ok(new { emailSent = sent, message = sent ? "Verification code resent." : "Email could not be sent. Try again later." });
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest? request)
    {
        var email = NormalizeEmail(request?.Email);
        var password = request?.Password ?? "";
        if (!IsValidEmail(email) || password.Length is < 1 or > 128)
            return Unauthorized(new { error = "Invalid email or password." });
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
        if (user == null || !user.EmailVerified || !VerifyPassword(user, password, out var needsRehash))
            return Unauthorized(new { error = "Invalid email or password." });
        if (needsRehash)
        {
            user.PasswordHash = _passwordHasher.HashPassword(user, password);
        }

        if (NormalizeRole(user.Role) == "Admin")
        {
            var code = GenerateSixDigitCode();
            user.AdminMfaCodeHash = HashCode("admin-login", email, code);
            user.AdminMfaExpiresUtc = DateTime.UtcNow.AddMinutes(10);
            user.AdminMfaFailedAttempts = 0;
            await _context.SaveChangesAsync();
            var sent = await _resendEmail.SendAdminLoginVerificationAsync(email, user.Name, code);
            if (!sent)
            {
                return StatusCode(503, new { error = "Administrator verification email could not be sent. Try again later." });
            }
            return Ok(new
            {
                mfaRequired = true,
                email,
                message = "Enter the 6-digit administrator code sent to your email.",
            });
        }

        if (needsRehash) await _context.SaveChangesAsync();
        var (token, expiresAtUtc) = CreateToken(user, adminMfaVerified: false);
        return Ok(new
        {
            token, expiresAtUtc, id = user.Id, name = user.Name, email = user.Email,
            phoneNumber = user.PhoneNumber ?? "", role = NormalizeRole(user.Role),
        });
    }

    [HttpPost("verify-admin-login")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyAdminLogin([FromBody] VerifyAdminLoginRequest? request)
    {
        var email = NormalizeEmail(request?.Email);
        var code = NormalizeSixDigitCode(request?.Code);
        if (!IsValidEmail(email) || code == null)
            return Unauthorized(new { error = "Invalid or expired administrator code." });

        var user = await _context.Users.FirstOrDefaultAsync(u =>
            u.Email.ToLower() == email && u.EmailVerified);
        if (user == null || NormalizeRole(user.Role) != "Admin" || string.IsNullOrWhiteSpace(user.AdminMfaCodeHash) ||
            user.AdminMfaExpiresUtc == null || user.AdminMfaExpiresUtc < DateTime.UtcNow ||
            user.AdminMfaFailedAttempts >= 5)
            return Unauthorized(new { error = "Invalid or expired administrator code." });

        if (!SecureHashEquals(user.AdminMfaCodeHash, HashCode("admin-login", email, code)))
        {
            user.AdminMfaFailedAttempts++;
            await _context.SaveChangesAsync();
            return Unauthorized(new { error = "Invalid or expired administrator code." });
        }

        user.AdminMfaCodeHash = null;
        user.AdminMfaExpiresUtc = null;
        user.AdminMfaFailedAttempts = 0;
        await _context.SaveChangesAsync();
        var (token, expiresAtUtc) = CreateToken(user, adminMfaVerified: true);
        return Ok(new
        {
            token, expiresAtUtc, id = user.Id, name = user.Name, email = user.Email,
            phoneNumber = user.PhoneNumber ?? "", role = NormalizeRole(user.Role),
        });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.EmailVerified);
        if (user == null) return Unauthorized();
        return Ok(new { id = user.Id, name = user.Name, email = user.Email, phoneNumber = user.PhoneNumber ?? "", role = NormalizeRole(user.Role) });
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest? request)
    {
        var email = NormalizeEmail(request?.Email);
        if (!IsValidEmail(email)) return BadRequest(new { error = "Enter a valid email." });
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email && u.EmailVerified);
        if (user != null)
        {
            var code = GenerateSixDigitCode();
            user.EmailVerificationCodeHash = HashCode("password-reset", email, code);
            user.EmailVerificationExpiresUtc = DateTime.UtcNow.AddMinutes(15);
            await _context.SaveChangesAsync();
            var sent = await _resendEmail.SendPasswordResetVerificationAsync(email, user.Name, code);
            if (!sent) _logger.LogWarning("[Auth] Password reset email delivery failed for {Email}", email);
        }
        return Ok(new { message = PasswordResetUserMessage });
    }

    [HttpPost("resend-password-reset")]
    [AllowAnonymous]
    public Task<IActionResult> ResendPasswordReset([FromBody] ForgotPasswordRequest? request) => ForgotPassword(request);

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest? request)
    {
        var email = NormalizeEmail(request?.Email);
        var code = NormalizeSixDigitCode(request?.Code);
        var password = request?.NewPassword ?? "";
        if (!IsValidEmail(email) || code == null || password.Length is < 12 or > 128)
            return BadRequest(new { error = "Invalid or expired verification code, or password does not meet requirements." });
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email && u.EmailVerified);
        if (user == null || string.IsNullOrEmpty(user.EmailVerificationCodeHash) ||
            user.EmailVerificationExpiresUtc is null || user.EmailVerificationExpiresUtc < DateTime.UtcNow ||
            !SecureHashEquals(user.EmailVerificationCodeHash, HashCode("password-reset", email, code)))
            return BadRequest(new { error = "Invalid or expired verification code." });
        user.PasswordHash = _passwordHasher.HashPassword(user, password);
        user.SessionVersion++;
        user.EmailVerificationCodeHash = null;
        user.EmailVerificationExpiresUtc = null;
        user.AdminMfaCodeHash = null;
        user.AdminMfaExpiresUtc = null;
        user.AdminMfaFailedAttempts = 0;
        await _context.SaveChangesAsync();
        return Ok(new { message = "Password has been updated. You can sign in now." });
    }

    private bool VerifyPassword(User user, string password, out bool needsRehash)
    {
        needsRehash = false;
        var hash = user.PasswordHash ?? "";
        if (hash.Length == 64 && hash.All(Uri.IsHexDigit))
        {
            // Privileged accounts seeded by older releases must rotate through the email-reset flow;
            // never accept a legacy unsalted SHA-256 password for Admin or Staff.
            if (NormalizeRole(user.Role) is "Admin" or "Staff") return false;
            var legacy = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(password))).ToLowerInvariant();
            needsRehash = SecureHashEquals(hash, legacy);
            return needsRehash;
        }
        var result = _passwordHasher.VerifyHashedPassword(user, hash, password);
        needsRehash = result == PasswordVerificationResult.SuccessRehashNeeded;
        return result != PasswordVerificationResult.Failed;
    }

    private (string Token, DateTime ExpiresAtUtc) CreateToken(User user, bool adminMfaVerified)
    {
        var key = _configuration["Jwt:SigningKey"]?.Trim();
        if (string.IsNullOrWhiteSpace(key)) key = "development-only-signing-key-change-me-32b";
        var expires = DateTime.UtcNow.AddMinutes(Math.Clamp(_configuration.GetValue("Jwt:ExpiryMinutes", 60), 15, 1440));
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Name ?? ""),
            new Claim(ClaimTypes.Email, user.Email ?? ""),
            new Claim(ClaimTypes.Role, NormalizeRole(user.Role)),
            new Claim("session_version", user.SessionVersion.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        };
        if (NormalizeRole(user.Role) == "Admin" && adminMfaVerified)
            claims.Add(new Claim("admin_mfa", "email"));
        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"] ?? "iga-server",
            audience: _configuration["Jwt:Audience"] ?? "iga-frontend",
            claims: claims,
            expires: expires,
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }

    private string HashCode(string purpose, string email, string code)
    {
        var pepper = _configuration["Auth:CodePepper"]?.Trim();
        if (string.IsNullOrWhiteSpace(pepper)) pepper = _configuration["Jwt:SigningKey"]?.Trim();
        if (string.IsNullOrWhiteSpace(pepper)) pepper = "development-only-code-pepper-change-me";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(pepper));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{purpose}|{email}|{code}"))).ToLowerInvariant();
    }

    private static string GenerateSixDigitCode() => RandomNumberGenerator.GetInt32(100000, 1000000).ToString("D6");
    private static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();
    private static string? NormalizeSixDigitCode(string? input)
    {
        var digits = new string((input ?? "").Where(char.IsDigit).ToArray());
        return digits.Length == 6 ? digits : null;
    }
    private static bool IsValidEmail(string email)
    {
        if (email.Length is < 3 or > 320) return false;
        try { return string.Equals(new MailAddress(email).Address, email, StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }
    private static bool SecureHashEquals(string left, string right)
    {
        var a = Encoding.ASCII.GetBytes(left);
        var b = Encoding.ASCII.GetBytes(right);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
    private static string NormalizeRole(string? role) => role?.Trim() switch
    {
        "Admin" => "Admin",
        "Staff" => "Staff",
        _ => "Customer",
    };
}

public class RegisterRequest { public string? Name { get; set; } public string? Email { get; set; } public string? Password { get; set; } }
public class VerifyEmailRequest { public string? Email { get; set; } public string? Code { get; set; } }
public class ResendVerificationRequest { public string? Email { get; set; } }
public class LoginRequest { public string? Email { get; set; } public string? Password { get; set; } }
public class VerifyAdminLoginRequest { public string? Email { get; set; } public string? Code { get; set; } }
public class ForgotPasswordRequest { public string? Email { get; set; } }
public class ResetPasswordRequest { public string? Email { get; set; } public string? Code { get; set; } public string? NewPassword { get; set; } }
