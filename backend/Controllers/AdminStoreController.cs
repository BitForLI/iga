using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Models;
using igaServer.Utils;

namespace igaServer.Controllers;

[Route("api/admin/store")]
[ApiController]
public class AdminStoreController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<AdminStoreController> _logger;

    public AdminStoreController(ApplicationDbContext context, IWebHostEnvironment env, ILogger<AdminStoreController> logger)
    {
        _context = context;
        _env = env;
        _logger = logger;
    }

    private async Task<IActionResult?> RequireAdminAsync()
    {
        var (ok, role) = await BackofficeAuthHelper.GetUserRoleAsync(Request, _context);
        if (!ok) return Unauthorized(new { error = "Sign in required" });
        if (!BackofficeAuthHelper.IsAdmin(role)) return StatusCode(403, new { error = "Admin only" });
        return null;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken cancellationToken)
    {
        if (await RequireAdminAsync() is { } denied) return denied;

        var store = await _context.StoreConfigs.OrderBy(s => s.Id).FirstOrDefaultAsync(cancellationToken);
        if (store == null)
        {
            store = new StoreConfig
            {
                PickupTimeSlotsJson = "[]",
                StoreName = "IGA",
                AbnNumber = "",
                TelegramChatId = "",
                HomeCarouselImagesJson = "[]",
                DeliveryZoneFeesJson = "[]",
            };
            _context.StoreConfigs.Add(store);
            await _context.SaveChangesAsync(cancellationToken);
        }

        var fees = StoreDeliveryHelper.ParseZoneFees(store.DeliveryZoneFeesJson);
        var zoneRows = StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(k => new DeliveryZoneFeeRowDto
        {
            Suburb = k,
            DisplayName = StoreDeliveryHelper.DisplaySuburb(k),
            FeeAud = fees.TryGetValue(k, out var f) ? f : StoreDeliveryHelper.DefaultZoneFeeAud,
        }).ToList();

        var carousel = StoreDeliveryHelper.ParseCarouselUrls(store.HomeCarouselImagesJson);

        return Ok(new StoreAdminSettingsDto
        {
            FreeShippingMinAud = store.FreeDeliveryThreshold > 0 ? store.FreeDeliveryThreshold : StoreDeliveryHelper.DefaultFreeShippingMinAud,
            DeliveryZoneFees = zoneRows,
            HomeCarouselImageUrls = carousel,
        });
    }

    [HttpPut("settings")]
    public async Task<IActionResult> PutSettings([FromBody] StoreAdminPutDto? body, CancellationToken cancellationToken)
    {
        if (await RequireAdminAsync() is { } denied) return denied;
        if (body == null) return BadRequest(new { error = "Invalid body" });

        var freeMin = body.FreeShippingMinAud ?? StoreDeliveryHelper.DefaultFreeShippingMinAud;
        if (freeMin < 0 || freeMin > 5000)
            return BadRequest(new { error = "Free shipping minimum must be between 0 and 5000 AUD" });

        var store = await _context.StoreConfigs.OrderBy(s => s.Id).FirstOrDefaultAsync(cancellationToken);
        if (store == null)
        {
            store = new StoreConfig
            {
                PickupTimeSlotsJson = "[]",
                StoreName = "IGA",
                AbnNumber = "",
                TelegramChatId = "",
                HomeCarouselImagesJson = "[]",
                DeliveryZoneFeesJson = "[]",
            };
            _context.StoreConfigs.Add(store);
        }

        store.FreeDeliveryThreshold = Math.Round(freeMin, 2, MidpointRounding.AwayFromZero);

        if (body.DeliveryZoneFees != null)
        {
            var list = new List<object>();
            foreach (var row in body.DeliveryZoneFees)
            {
                var key = (row.Suburb ?? "").Trim().ToLowerInvariant();
                if (!StoreDeliveryHelper.AllowedDeliverySuburbKeys.Contains(key))
                    return BadRequest(new { error = $"Unknown suburb: {row.Suburb}" });
                if (row.FeeAud < 0 || row.FeeAud > 500)
                    return BadRequest(new { error = $"Invalid fee for {key}" });
                list.Add(new { suburb = key, fee = Math.Round(row.FeeAud, 2, MidpointRounding.AwayFromZero) });
            }

            if (list.Count != StoreDeliveryHelper.AllowedDeliverySuburbKeys.Length)
                return BadRequest(new { error = "Provide exactly one fee row per delivery zone" });

            store.DeliveryZoneFeesJson = JsonSerializer.Serialize(list);
        }

        if (body.HomeCarouselImageUrls != null)
        {
            var urls = body.HomeCarouselImageUrls
                .Select(u => (u ?? "").Trim())
                .Where(u => u.Length > 0)
                .Take(6)
                .ToList();
            foreach (var u in urls)
            {
                if (u.Length > 2048)
                    return BadRequest(new { error = "Carousel URL too long" });
                if (!u.StartsWith("/uploads/", StringComparison.Ordinal) && !u.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "Carousel images must be /uploads/... paths or https URLs" });
            }

            store.HomeCarouselImagesJson = JsonSerializer.Serialize(urls);
        }

        await _context.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("[AdminStore] Settings updated");
        return Ok(new { message = "Saved" });
    }

    /// <summary>Upload a hero carousel image to wwwroot/uploads/store.</summary>
    [HttpPost("upload-carousel-image")]
    [RequestSizeLimit(8 * 1024 * 1024)]
    public async Task<IActionResult> UploadCarouselImage(IFormFile? file)
    {
        if (await RequireAdminAsync() is { } denied) return denied;
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded" });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowed = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
        if (!allowed.Contains(ext))
            return BadRequest(new { error = "Only JPG, PNG, GIF or WebP images are allowed" });

        if (file.Length > 8 * 1024 * 1024)
            return BadRequest(new { error = "File size must not exceed 8MB" });

        var webRoot = _env.WebRootPath;
        if (string.IsNullOrEmpty(webRoot))
            return StatusCode(500, new { error = "Web root path is not configured" });

        var uploadDir = Path.Combine(webRoot, "uploads", "store");
        Directory.CreateDirectory(uploadDir);

        var fileName = $"{Guid.NewGuid():N}{ext}";
        var savePath = Path.Combine(uploadDir, fileName);
        await using (var stream = System.IO.File.Create(savePath))
        {
            await file.CopyToAsync(stream);
        }

        var url = $"/uploads/store/{fileName}";
        return Ok(new { url });
    }

    public class StoreAdminSettingsDto
    {
        public decimal FreeShippingMinAud { get; set; }
        public List<DeliveryZoneFeeRowDto> DeliveryZoneFees { get; set; } = new();
        public List<string> HomeCarouselImageUrls { get; set; } = new();
    }

    public class DeliveryZoneFeeRowDto
    {
        public string Suburb { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public decimal FeeAud { get; set; }
    }

    public class StoreAdminPutDto
    {
        public decimal? FreeShippingMinAud { get; set; }
        public List<DeliveryZoneFeeInputDto>? DeliveryZoneFees { get; set; }
        public List<string>? HomeCarouselImageUrls { get; set; }
    }

    public class DeliveryZoneFeeInputDto
    {
        public string? Suburb { get; set; }
        public decimal FeeAud { get; set; }
    }
}
