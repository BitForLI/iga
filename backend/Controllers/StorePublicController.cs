using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Utils;

namespace igaServer.Controllers;

[Route("api/store")]
[ApiController]
public class StorePublicController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public StorePublicController(ApplicationDbContext context) => _context = context;

    [HttpGet("public-settings")]
    public async Task<IActionResult> GetPublicSettings(CancellationToken cancellationToken)
    {
        var store = await _context.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync(cancellationToken);
        var zoneInfos = StoreDeliveryHelper.ParseZoneInfos(store?.DeliveryZoneFeesJson);
        var feeRules = StoreDeliveryHelper.ParseDeliveryFeeRules(store?.DeliveryZoneFeesJson)
            .Any()
            ? StoreDeliveryHelper.ParseDeliveryFeeRules(store?.DeliveryZoneFeesJson).OrderBy(r => r.MinAmount).ToList()
            : StoreDeliveryHelper.BuildFallbackFeeRules(store != null && store.FreeDeliveryThreshold > 0 ? store.FreeDeliveryThreshold : StoreDeliveryHelper.DefaultFreeShippingMinAud);

        var freeMin = feeRules.Where(r => r.FeeAud == 0).Select(r => r.MinAmount).DefaultIfEmpty(store != null && store.FreeDeliveryThreshold > 0 ? store.FreeDeliveryThreshold : StoreDeliveryHelper.DefaultFreeShippingMinAud).Max();
        var zones = StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(k =>
        {
            var info = zoneInfos.TryGetValue(k, out var zoneInfo) ? zoneInfo : new StoreDeliveryHelper.DeliveryZoneInfo();
            return new
            {
                suburbKey = k,
                displayName = StoreDeliveryHelper.DisplaySuburb(k),
                feeAud = (double)info.Fee,
                enabled = info.Enabled,
            };
        }).ToList();

        var carousel = StoreDeliveryHelper.ParseCarouselUrls(store?.HomeCarouselImagesJson);

        return Ok(new
        {
            freeShippingMinAud = freeMin,
            deliveryZones = zones,
            deliveryFeeRules = feeRules.Select(r => new { minAmount = (double)r.MinAmount, feeAud = (double)r.FeeAud }).ToList(),
            homeCarouselImageUrls = carousel,
        });
    }

    /// <summary>Public binary for a DB-stored carousel image (referenced by <c>homeCarouselImageUrls</c>).</summary>
    [HttpGet("carousel-image/{id:guid}")]
    [ResponseCache(Duration = 86400, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> GetCarouselImage(Guid id, CancellationToken cancellationToken)
    {
        var row = await _context.StoreCarouselImages.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (row == null) return NotFound();
        return File(row.ImageBytes, row.ContentType);
    }
}
