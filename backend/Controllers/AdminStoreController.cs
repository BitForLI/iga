using System.Text.Json;
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
    private readonly ILogger<AdminStoreController> _logger;

    public AdminStoreController(ApplicationDbContext context, ILogger<AdminStoreController> logger)
    {
        _context = context;
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

        var zoneInfos = StoreDeliveryHelper.ParseZoneInfos(store.DeliveryZoneFeesJson);
        var zoneRows = StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(k => new DeliveryZoneFeeRowDto
        {
            Suburb = k,
            DisplayName = StoreDeliveryHelper.DisplaySuburb(k),
            Enabled = zoneInfos.TryGetValue(k, out var info) ? info.Enabled : true,
        }).ToList();

        var parsedFeeRules = StoreDeliveryHelper.ParseDeliveryFeeRules(store.DeliveryZoneFeesJson);
        var feeRules = parsedFeeRules.Any()
            ? parsedFeeRules.OrderBy(r => r.MinAmount).ToList()
            : StoreDeliveryHelper.BuildFallbackFeeRules(store.FreeDeliveryThreshold > 0 ? store.FreeDeliveryThreshold : StoreDeliveryHelper.DefaultFreeShippingMinAud);

        var freeMin = feeRules.Where(r => r.FeeAud == 0).Select(r => r.MinAmount).DefaultIfEmpty(store.FreeDeliveryThreshold > 0 ? store.FreeDeliveryThreshold : StoreDeliveryHelper.DefaultFreeShippingMinAud).Max();
        var carousel = StoreDeliveryHelper.ParseCarouselUrls(store.HomeCarouselImagesJson);

        return Ok(new StoreAdminSettingsDto
        {
            FreeShippingMinAud = freeMin,
            AbnNumber = store.AbnNumber?.Trim() ?? string.Empty,
            DeliveryZones = zoneRows,
            DeliveryFeeRules = feeRules.Select(r => new DeliveryFeeRuleDto
            {
                MinAmount = r.MinAmount,
                FeeAud = r.FeeAud,
            }).ToList(),
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

        if (body.AbnNumber != null)
        {
            store.AbnNumber = body.AbnNumber.Trim();
        }

        var existingZoneInfos = StoreDeliveryHelper.ParseZoneInfos(store.DeliveryZoneFeesJson);
        var zoneRows = existingZoneInfos.ToDictionary(kv => kv.Key, kv => kv.Value.Enabled, StringComparer.OrdinalIgnoreCase);
        var existingFeeRules = StoreDeliveryHelper.ParseDeliveryFeeRules(store.DeliveryZoneFeesJson);
        var feeRules = existingFeeRules.Any()
            ? existingFeeRules.OrderBy(r => r.MinAmount).ToList()
            : StoreDeliveryHelper.BuildFallbackFeeRules(store.FreeDeliveryThreshold > 0 ? store.FreeDeliveryThreshold : StoreDeliveryHelper.DefaultFreeShippingMinAud);

        if (body.DeliveryZoneFees != null)
        {
            var nextZones = new List<object>();
            foreach (var row in body.DeliveryZoneFees)
            {
                var key = StoreDeliveryHelper.NormalizeSuburbKey(row.Suburb);
                if (!StoreDeliveryHelper.AllowedDeliverySuburbKeys.Contains(key))
                    return BadRequest(new { error = $"Unknown suburb: {row.Suburb}" });
                nextZones.Add(new
                {
                    suburb = key,
                    enabled = row.Enabled,
                });
                zoneRows[key] = row.Enabled;
            }

            if (nextZones.Count != StoreDeliveryHelper.AllowedDeliverySuburbKeys.Length)
                return BadRequest(new { error = "Provide exactly one zone row per delivery suburb" });
        }

        if (body.DeliveryFeeRules != null)
        {
            var nextRules = new List<StoreDeliveryHelper.DeliveryFeeRule>();
            foreach (var row in body.DeliveryFeeRules)
            {
                if (row.MinAmount < 0 || row.FeeAud < 0 || row.FeeAud > 500)
                    return BadRequest(new { error = "Delivery rule values must be between 0 and 500 AUD" });
                nextRules.Add(new StoreDeliveryHelper.DeliveryFeeRule
                {
                    MinAmount = Math.Round(row.MinAmount, 2, MidpointRounding.AwayFromZero),
                    FeeAud = Math.Round(row.FeeAud, 2, MidpointRounding.AwayFromZero),
                });
            }

            if (!nextRules.Any())
                return BadRequest(new { error = "At least one delivery fee rule is required" });
            if (!nextRules.Any(r => r.MinAmount == 0))
                return BadRequest(new { error = "The first delivery rule must start at 0 AUD" });

            feeRules = nextRules.OrderBy(r => r.MinAmount).ToList();
            store.FreeDeliveryThreshold = feeRules.Where(r => r.FeeAud == 0).Select(r => r.MinAmount).DefaultIfEmpty(0).Max();
        }

        if (body.DeliveryZoneFees != null || body.DeliveryFeeRules != null)
        {
            var zonesArray = StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(k => new
            {
                suburb = k,
                enabled = zoneRows.TryGetValue(k, out var enabled) ? enabled : true,
            }).ToList();

            var rulesArray = feeRules.OrderBy(r => r.MinAmount).Select(r => new
            {
                minAmount = r.MinAmount,
                feeAud = r.FeeAud,
            }).ToList();

            store.DeliveryZoneFeesJson = JsonSerializer.Serialize(new { zones = zonesArray, deliveryFeeRules = rulesArray });
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
                if (!CarouselImageStorageHelper.IsAllowedCarouselUrl(u))
                    return BadRequest(new { error = "Carousel images must be /uploads/..., https URLs, or /api/store/carousel-image/{id} (stored in database)" });
                if (CarouselImageStorageHelper.TryParseEmbeddedCarouselId(u, out var cid))
                {
                    var exists = await _context.StoreCarouselImages.AnyAsync(x => x.Id == cid, cancellationToken);
                    if (!exists)
                        return BadRequest(new { error = $"Unknown carousel image id: {cid}" });
                }
            }

            store.HomeCarouselImagesJson = JsonSerializer.Serialize(urls);
            await DeleteOrphanCarouselImagesAsync(urls, cancellationToken);
        }

        await _context.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("[AdminStore] Settings updated");
        return Ok(new { message = "Saved" });
    }

    /// <summary>Upload a hero carousel image into the database (survives redeploy without uploads volume).</summary>
    [HttpPost("upload-carousel-image")]
    [RequestSizeLimit(8 * 1024 * 1024)]
    public async Task<IActionResult> UploadCarouselImage(IFormFile? file, CancellationToken cancellationToken)
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

        await using var ms = new MemoryStream();
        await file.CopyToAsync(ms, cancellationToken);
        var bytes = ms.ToArray();
        if (bytes.Length == 0)
            return BadRequest(new { error = "No file uploaded" });
        if (bytes.Length > 8 * 1024 * 1024)
            return BadRequest(new { error = "File size must not exceed 8MB" });

        var contentType = string.IsNullOrWhiteSpace(file.ContentType) ? ContentTypeFromImageExtension(ext) : file.ContentType.Trim();
        var id = Guid.NewGuid();
        _context.StoreCarouselImages.Add(
            new StoreCarouselImage
            {
                Id = id,
                ImageBytes = bytes,
                ContentType = contentType,
                CreatedAtUtc = DateTime.UtcNow,
            });
        await _context.SaveChangesAsync(cancellationToken);

        var url = $"{CarouselImageStorageHelper.PublicPathPrefix}{id:D}";
        return Ok(new { url });
    }

    private static string ContentTypeFromImageExtension(string ext) =>
        ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            _ => "application/octet-stream",
        };

    /// <summary>Remove DB carousel blobs that are no longer listed in settings (frees space after edits).</summary>
    private async Task DeleteOrphanCarouselImagesAsync(List<string> urls, CancellationToken cancellationToken)
    {
        var keep = new HashSet<Guid>();
        foreach (var u in urls)
        {
            if (CarouselImageStorageHelper.TryParseEmbeddedCarouselId(u, out var id))
                keep.Add(id);
        }

        var orphans = await _context.StoreCarouselImages.Where(x => !keep.Contains(x.Id)).ToListAsync(cancellationToken);
        if (orphans.Count == 0) return;
        _context.StoreCarouselImages.RemoveRange(orphans);
        _logger.LogInformation("[AdminStore] Removed {Count} orphan carousel image(s) from database", orphans.Count);
    }

    public class StoreAdminSettingsDto
    {
        public decimal FreeShippingMinAud { get; set; }
        public string AbnNumber { get; set; } = string.Empty;
        public List<DeliveryZoneFeeRowDto> DeliveryZones { get; set; } = new();
        public List<DeliveryFeeRuleDto> DeliveryFeeRules { get; set; } = new();
        public List<string> HomeCarouselImageUrls { get; set; } = new();
    }

    public class DeliveryZoneFeeRowDto
    {
        public string Suburb { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public bool Enabled { get; set; } = true;
    }

    public class DeliveryFeeRuleDto
    {
        public decimal MinAmount { get; set; }
        public decimal FeeAud { get; set; }
    }

    public class StoreAdminPutDto
    {
        public decimal? FreeShippingMinAud { get; set; }
        public string? AbnNumber { get; set; }
        public List<DeliveryZoneFeeInputDto>? DeliveryZoneFees { get; set; }
        public List<DeliveryFeeRuleInputDto>? DeliveryFeeRules { get; set; }
        public List<string>? HomeCarouselImageUrls { get; set; }
    }

    public class DeliveryZoneFeeInputDto
    {
        public string? Suburb { get; set; }
        public decimal FeeAud { get; set; }
        public bool Enabled { get; set; } = true;
    }

    public class DeliveryFeeRuleInputDto
    {
        public decimal MinAmount { get; set; }
        public decimal FeeAud { get; set; }
    }
}
