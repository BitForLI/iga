using System.Text.Json;

namespace igaServer.Utils;

public static class StoreDeliveryHelper
{
    public sealed class DeliveryZoneInfo
    {
        public decimal Fee { get; set; } = DefaultZoneFeeAud;
        public bool Enabled { get; set; } = true;
    }

    public sealed class DeliveryFeeRule
    {
        public decimal MinAmount { get; set; }
        public decimal FeeAud { get; set; }
    }

    private sealed class DeliverySettings
    {
        public Dictionary<string, DeliveryZoneInfo> ZoneInfos { get; } = new(StringComparer.OrdinalIgnoreCase);
        public List<DeliveryFeeRule> FeeRules { get; } = new();
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

        var settings = ParseDeliverySettings(deliveryZoneFeesJson);
        return !settings.ZoneInfos.TryGetValue(key, out var info) || info.Enabled;
    }

    /// <summary>Items subtotal only (before delivery fee). Returns 0 when free shipping applies.</summary>
    public static decimal ComputeDeliveryFeeAud(
        string? deliverySuburb,
        decimal itemsSubtotal,
        string? deliveryZoneFeesJson,
        decimal freeShippingThresholdAud)
    {
        var settings = ParseDeliverySettings(deliveryZoneFeesJson);
        var feeRules = settings.FeeRules.Any()
            ? settings.FeeRules.OrderBy(r => r.MinAmount).ToList()
            : BuildFallbackFeeRules(freeShippingThresholdAud);

        if (feeRules.Count == 0)
            return 0;

        var key = NormalizeSuburbKey(deliverySuburb);
        if (string.IsNullOrEmpty(key) || !AllowedDeliverySuburbKeys.Contains(key))
            return 0;

        var zoneInfo = settings.ZoneInfos.TryGetValue(key, out var info) ? info : new DeliveryZoneInfo();
        if (!zoneInfo.Enabled)
            return 0;

        var rule = feeRules
            .Where(r => itemsSubtotal >= r.MinAmount)
            .OrderByDescending(r => r.MinAmount)
            .FirstOrDefault();

        return rule == null ? 0 : Math.Round(Math.Max(0, rule.FeeAud), 2, MidpointRounding.AwayFromZero);
    }

    public static Dictionary<string, decimal> ParseZoneFees(string? json)
    {
        return ParseZoneInfos(json)
            .Where(kv => kv.Value.Enabled)
            .ToDictionary(kv => kv.Key, kv => kv.Value.Fee, StringComparer.OrdinalIgnoreCase);
    }

    public static Dictionary<string, DeliveryZoneInfo> ParseZoneInfos(string? json)
    {
        return ParseDeliverySettings(json).ZoneInfos;
    }

    public static List<DeliveryFeeRule> ParseDeliveryFeeRules(string? json)
    {
        var settings = ParseDeliverySettings(json);
        return settings.FeeRules.OrderBy(r => r.MinAmount).ToList();
    }

    public static List<DeliveryFeeRule> BuildFallbackFeeRules(decimal freeShippingThresholdAud)
    {
        return new List<DeliveryFeeRule>
        {
            new DeliveryFeeRule { MinAmount = 0, FeeAud = DefaultZoneFeeAud },
            new DeliveryFeeRule { MinAmount = Math.Max(0, freeShippingThresholdAud), FeeAud = 0 },
        };
    }

    private static DeliverySettings ParseDeliverySettings(string? json)
    {
        var settings = new DeliverySettings();
        if (string.IsNullOrWhiteSpace(json) || json.Trim() == "[]")
            return settings;

        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in doc.RootElement.EnumerateArray())
                    ParseZoneElement(el, settings.ZoneInfos);
                return settings;
            }

            if (doc.RootElement.ValueKind != JsonValueKind.Object)
                return settings;

            var root = doc.RootElement;
            if (root.TryGetProperty("zones", out var zonesElement) && zonesElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in zonesElement.EnumerateArray())
                    ParseZoneElement(el, settings.ZoneInfos);
            }
            else if (root.TryGetProperty("suburb", out _))
            {
                ParseZoneElement(root, settings.ZoneInfos);
            }

            if (root.TryGetProperty("deliveryFeeRules", out var rulesElement) && rulesElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in rulesElement.EnumerateArray())
                {
                    var rule = new DeliveryFeeRule();
                    if (el.TryGetProperty("minAmount", out var m))
                    {
                        if (m.ValueKind == JsonValueKind.Number)
                            rule.MinAmount = m.GetDecimal();
                        else if (m.ValueKind == JsonValueKind.String && decimal.TryParse(m.GetString(), out var parsed))
                            rule.MinAmount = parsed;
                    }
                    if (el.TryGetProperty("feeAud", out var f))
                    {
                        if (f.ValueKind == JsonValueKind.Number)
                            rule.FeeAud = f.GetDecimal();
                        else if (f.ValueKind == JsonValueKind.String && decimal.TryParse(f.GetString(), out var parsed))
                            rule.FeeAud = parsed;
                    }
                    else if (el.TryGetProperty("fee", out var f2))
                    {
                        if (f2.ValueKind == JsonValueKind.Number)
                            rule.FeeAud = f2.GetDecimal();
                        else if (f2.ValueKind == JsonValueKind.String && decimal.TryParse(f2.GetString(), out var parsed))
                            rule.FeeAud = parsed;
                    }

                    if (rule.MinAmount >= 0 && rule.FeeAud >= 0)
                        settings.FeeRules.Add(rule);
                }
            }
        }
        catch
        {
            /* ignore malformed json */
        }

        return settings;
    }

    private static void ParseZoneElement(JsonElement el, Dictionary<string, DeliveryZoneInfo> zones)
    {
        var raw = el.TryGetProperty("suburb", out var s) ? s.GetString()?.Trim().ToLowerInvariant() : null;
        var suburb = NormalizeSuburbKey(raw);
        if (string.IsNullOrEmpty(suburb) || !AllowedDeliverySuburbKeys.Contains(suburb))
            return;

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

        zones[suburb] = info;
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
