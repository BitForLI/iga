using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Models;
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
}
