using System.ComponentModel.DataAnnotations;
using IGA.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Data;

namespace igaServer.Controllers;

/// <summary>Website contact form: anonymous POST; emails admin/staff via Resend.</summary>
[Route("api/[controller]")]
[ApiController]
public class ContactController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IResendEmailService _resendEmail;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ContactController> _logger;

    public ContactController(
        ApplicationDbContext context,
        IResendEmailService resendEmail,
        IConfiguration configuration,
        ILogger<ContactController> logger)
    {
        _context = context;
        _resendEmail = resendEmail;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("inquiry")]
    public async Task<IActionResult> PostInquiry([FromBody] ContactInquiryRequest? body, CancellationToken cancellationToken)
    {
        if (body == null)
            return BadRequest(new { error = "Invalid body" });

        var name = (body.Name ?? "").Trim();
        var email = (body.Email ?? "").Trim();
        var message = (body.Message ?? "").Trim();

        if (name.Length < 1 || name.Length > 200)
            return BadRequest(new { error = "Please enter your name (max 200 characters)." });
        if (email.Length < 3 || email.Length > 256 || !email.Contains('@', StringComparison.Ordinal))
            return BadRequest(new { error = "Please enter a valid email address." });
        if (message.Length < 1 || message.Length > 4000)
            return BadRequest(new { error = "Please enter a message (max 4000 characters)." });

        var fromDb = await _context.Users
            .AsNoTracking()
            .Where(u => u.EmailVerified && (u.Role == "Admin" || u.Role == "Staff"))
            .Select(u => u.Email.Trim().ToLowerInvariant())
            .Distinct()
            .ToListAsync(cancellationToken);

        var fallback = _configuration.GetSection("ContactInquiry:NotifyEmails").Get<string[]>() ?? Array.Empty<string>();
        var recipients = fromDb.Count > 0
            ? fromDb
            : fallback.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim().ToLowerInvariant()).Distinct().ToList();

        if (recipients.Count == 0)
        {
            _logger.LogWarning("[Contact] No Admin/Staff recipients and ContactInquiry:NotifyEmails is empty; cannot send.");
            return StatusCode(503, new { error = "Contact service is not configured. Please try again later." });
        }

        var ok = await _resendEmail.SendContactInquiryAsync(recipients, name, email, message, cancellationToken);
        if (!ok)
        {
            _logger.LogWarning("[Contact] Resend send failed. Customer={Email}", email);
            return StatusCode(502, new { error = "Could not send your message. Please try again later or call the store." });
        }

        return Ok(new { ok = true, message = "Your message has been sent." });
    }

    public class ContactInquiryRequest
    {
        [MaxLength(200)]
        public string? Name { get; set; }

        [MaxLength(256)]
        [EmailAddress]
        public string? Email { get; set; }

        [MaxLength(4000)]
        public string? Message { get; set; }
    }
}
