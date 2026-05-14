using System.Text.Json;

namespace igaServer.Utils;

public static class StoreDeliveryHelper
{
    /// <summary>Canonical lowercase keys; multi-word suburbs use spaces (e.g. "bexley north").</summary>
    public static readonly string[] AllowedDeliverySuburbKeys =
    [
        "riverwood",
        "roselands",
        "kingsgrove",
        "bexley north",
        "bexley",
        "rockdale",
        "kogarah",
        "carlton",
        "allawah",
        "hurstville",
        "penshurst",
        "beverly hills",
        "wolli creek",
        "arncliffe",
    ];

    public const decimal DefaultZoneFeeAud = 10m;
    public const decimal DefaultFreeShippingMinAud = 69m;

    /// <summary>Maps API/order strings to canonical keys (e.g. legacy roseland → roselands).</summary>
    public static string NormalizeSuburbKey(string? suburb)
    {
        var k = (suburb ?? "").Trim().ToLowerInvariant();
        return k == "roseland" ? "roselands" : k;
    }

    public static string DisplaySuburb(string key)
    {
        var k = NormalizeSuburbKey(key ?? "");
        return k switch
        {
            "riverwood" => "Riverwood",
            "roselands" => "Roselands",
            "kingsgrove" => "Kingsgrove",
            "bexley north" => "Bexley North",
            "bexley" => "Bexley",
            "rockdale" => "Rockdale",
            "kogarah" => "Kogarah",
            "carlton" => "Carlton",
            "allawah" => "Allawah",
            "hurstville" => "Hurstville",
            "penshurst" => "Penshurst",
            "beverly hills" => "Beverly Hills",
            "wolli creek" => "Wolli Creek",
            "arncliffe" => "Arncliffe",
            _ => string.IsNullOrEmpty(k) ? "" : char.ToUpperInvariant(k[0]) + k[1..],
        };
    }

    public static bool IsAllowedSuburb(string? suburb) =>
        AllowedDeliverySuburbKeys.Contains(NormalizeSuburbKey(suburb));

    /// <summary>Items subtotal only (before delivery fee). Returns 0 when free shipping applies.</summary>
    public static decimal ComputeDeliveryFeeAud(
        string? deliverySuburb,
        decimal itemsSubtotal,
        string? deliveryZoneFeesJson,
        decimal freeShippingThresholdAud)
    {
        if (itemsSubtotal >= freeShippingThresholdAud)
            return 0;

        var key = NormalizeSuburbKey(deliverySuburb);
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
                var raw = el.TryGetProperty("suburb", out var s) ? s.GetString()?.Trim().ToLowerInvariant() : null;
                var suburb = NormalizeSuburbKey(raw);
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
