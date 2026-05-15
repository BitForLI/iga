using System.Text.Json;

namespace igaServer.Utils;

public static class StoreDeliveryHelper
{
    public sealed class DeliveryZoneInfo
    {
        public decimal Fee { get; set; } = DefaultZoneFeeAud;
        public bool Enabled { get; set; } = true;
    }

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

    public static bool IsAllowedSuburb(string? suburb, string? deliveryZoneFeesJson = null)
    {
        var key = NormalizeSuburbKey(suburb);
        if (string.IsNullOrEmpty(key) || !AllowedDeliverySuburbKeys.Contains(key))
            return false;

        if (string.IsNullOrEmpty(deliveryZoneFeesJson))
            return true;

        var infos = ParseZoneInfos(deliveryZoneFeesJson);
        return !infos.TryGetValue(key, out var info) || info.Enabled;
    }

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

        var infos = ParseZoneInfos(deliveryZoneFeesJson);
        if (infos.TryGetValue(key, out var info))
            return info.Enabled ? Math.Round(info.Fee < 0 ? 0 : info.Fee, 2, MidpointRounding.AwayFromZero) : 0;

        return DefaultZoneFeeAud;
    }

    public static Dictionary<string, decimal> ParseZoneFees(string? json)
    {
        return ParseZoneInfos(json)
            .Where(kv => kv.Value.Enabled)
            .ToDictionary(kv => kv.Key, kv => kv.Value.Fee, StringComparer.OrdinalIgnoreCase);
    }

    public static Dictionary<string, DeliveryZoneInfo> ParseZoneInfos(string? json)
    {
        var dict = new Dictionary<string, DeliveryZoneInfo>(StringComparer.OrdinalIgnoreCase);
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

                var info = new DeliveryZoneInfo();

                if (el.TryGetProperty("fee", out var f))
                {
                    decimal fee;
                    if (f.ValueKind == JsonValueKind.Number)
                        fee = f.GetDecimal();
                    else if (f.ValueKind == JsonValueKind.String && decimal.TryParse(f.GetString(), out var parsed))
                        fee = parsed;
                    else
                        fee = DefaultZoneFeeAud;
                    info.Fee = fee;
                }

                if (el.TryGetProperty("enabled", out var e))
                {
                    if (e.ValueKind == JsonValueKind.True)
                        info.Enabled = true;
                    else if (e.ValueKind == JsonValueKind.False)
                        info.Enabled = false;
                    else if (e.ValueKind == JsonValueKind.String && bool.TryParse(e.GetString(), out var parsed))
                        info.Enabled = parsed;
                }

                dict[suburb] = info;
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
