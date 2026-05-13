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
        var freeMin = store != null && store.FreeDeliveryThreshold > 0
            ? (double)store.FreeDeliveryThreshold
            : (double)StoreDeliveryHelper.DefaultFreeShippingMinAud;

        var fees = StoreDeliveryHelper.ParseZoneFees(store?.DeliveryZoneFeesJson);
        var zones = StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(k => new
        {
            suburbKey = k,
            displayName = StoreDeliveryHelper.DisplaySuburb(k),
            feeAud = fees.TryGetValue(k, out var f) ? (double)f : (double)StoreDeliveryHelper.DefaultZoneFeeAud,
        }).ToList();

        var carousel = StoreDeliveryHelper.ParseCarouselUrls(store?.HomeCarouselImagesJson);

        return Ok(new
        {
            freeShippingMinAud = freeMin,
            deliveryZones = zones,
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
