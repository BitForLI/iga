using System.Text.Json;

namespace igaServer.Utils;

public static class StoreDeliveryHelper
{
    public static readonly string[] AllowedDeliverySuburbKeys =
        ["hurstville", "allawah", "carlton", "roseland"];

    public const decimal DefaultZoneFeeAud = 10m;
    public const decimal DefaultFreeShippingMinAud = 69m;

    public static string DisplaySuburb(string key)
    {
        var k = (key ?? "").Trim().ToLowerInvariant();
        return k switch
        {
            "hurstville" => "Hurstville",
            "allawah" => "Allawah",
            "carlton" => "Carlton",
            "roseland" => "Roseland",
            _ => string.IsNullOrEmpty(k) ? "" : char.ToUpperInvariant(k[0]) + k[1..],
        };
    }

    public static bool IsAllowedSuburb(string? suburb) =>
        AllowedDeliverySuburbKeys.Contains((suburb ?? "").Trim().ToLowerInvariant());

    /// <summary>Items subtotal only (before delivery fee). Returns 0 when free shipping applies.</summary>
    public static decimal ComputeDeliveryFeeAud(
        string? deliverySuburb,
        decimal itemsSubtotal,
        string? deliveryZoneFeesJson,
        decimal freeShippingThresholdAud)
    {
        if (itemsSubtotal >= freeShippingThresholdAud)
            return 0;

        var key = (deliverySuburb ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(key) || !AllowedDeliverySuburbKeys.Contains(key))
            return 0;

        var map = ParseZoneFees(deliveryZoneFeesJson);
        if (map.TryGetValue(key, out var fee))
            return fee < 0 ? 0 : Math.Round(fee, 2, MidpointRounding.AwayFromZero);

        return DefaultZoneFeeAud;
    }

    public static Dictionary<string, decimal> ParseZoneFees(string? json)
    {
        var dict = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(json) || json.Trim() == "[]")
            return dict;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
                return dict;
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                var suburb = el.TryGetProperty("suburb", out var s) ? s.GetString()?.Trim().ToLowerInvariant() : null;
                if (string.IsNullOrEmpty(suburb) || !AllowedDeliverySuburbKeys.Contains(suburb))
                    continue;
                if (!el.TryGetProperty("fee", out var f))
                    continue;
                decimal fee;
                if (f.ValueKind == JsonValueKind.Number)
                    fee = f.GetDecimal();
                else if (f.ValueKind == JsonValueKind.String && decimal.TryParse(f.GetString(), out var parsed))
                    fee = parsed;
                else
                    continue;
                dict[suburb] = fee;
            }
        }
        catch
        {
            /* ignore malformed json */
        }

        return dict;
    }

    public static List<string> ParseCarouselUrls(string? json)
    {
        var list = new List<string>();
        if (string.IsNullOrWhiteSpace(json) || json.Trim() == "[]")
            return list;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
                return list;
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                if (el.ValueKind == JsonValueKind.String)
                {
                    var u = el.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(u))
                        list.Add(u);
                }
            }
        }
        catch
        {
            /* ignore */
        }

        return list;
    }
}
