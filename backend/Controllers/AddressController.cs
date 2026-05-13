using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace igaServer.Controllers;

// #region agent log
internal static class AddressSuggestDebugLog
{
    internal static void Write(string hypothesisId, string message, object data)
    {
        try
        {
            var payload = new
            {
                sessionId = "936b1a",
                hypothesisId,
                location = "AddressController.cs",
                message,
                data,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            var line = JsonSerializer.Serialize(payload);
            Console.WriteLine("[DEBUG_ADDRESS_SUGGEST] " + line);
            try
            {
                System.IO.File.AppendAllText(
                    "/Users/sinno/Documents/Projects/iga/.cursor/debug-936b1a.log",
                    line + "\n");
            }
            catch
            {
                /* local path only */
            }
        }
        catch
        {
            /* ignore */
        }
    }
}
// #endregion

/// <summary>
/// 顾客端地址联想：由后端携带 Mapbox token 调用 Geocoding API，避免前端构建变量与 Mapbox URL 白名单问题。
/// </summary>
[Route("api/address")]
[ApiController]
public class AddressController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;

    public AddressController(IHttpClientFactory httpClientFactory, IConfiguration config)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
    }

    private string? MapboxToken
    {
        get
        {
            var t = _config["Mapbox:AccessToken"];
            return string.IsNullOrWhiteSpace(t) ? null : t.Trim();
        }
    }

    /// <summary>
    /// query 少于 3 个字符时不请求 Mapbox，仅返回 <paramref name="configured"/> 表示服务端是否已配置 token。
    /// </summary>
    [HttpGet("suggest")]
    public async Task<IActionResult> Suggest([FromQuery] string? query, CancellationToken cancellationToken)
    {
        var token = MapboxToken;
        var configured = token is not null;
        var q = query?.Trim() ?? "";
        if (q.Length < 3)
            return Ok(new { configured, suggestions = Array.Empty<object>() });

        if (!configured)
            return Ok(new { configured = false, suggestions = Array.Empty<object>() });

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("iga-beverly-hills/1.0 (+address-suggest)");

        // Geocoding URL is .../mapbox.places/{search}.json — "/" becomes "%2F" in the path; some proxies mishandle it.
        // Normalize slashes to spaces for the Mapbox segment only (e.g. "2/10 Woniora Rd" → "2 10 Woniora Rd").
        var mapboxSearch = string.Join(
            ' ',
            q.Split(new[] { '/', '\\' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (string.IsNullOrWhiteSpace(mapboxSearch)) mapboxSearch = q;
        var enc = Uri.EscapeDataString(mapboxSearch);
        var url =
            $"https://api.mapbox.com/geocoding/v5/mapbox.places/{enc}.json"
            + $"?access_token={Uri.EscapeDataString(token)}"
            + "&country=AU&limit=8&proximity=151.1,-33.967&bbox=150.82,-34.18,151.42,-33.72&language=en";

        HttpResponseMessage resp;
        try
        {
            resp = await client.GetAsync(url, cancellationToken);
        }
        catch (Exception ex)
        {
            AddressSuggestDebugLog.Write(
                "H-mapbox-http-exception",
                "Mapbox HTTP client threw",
                new { queryLen = q.Length, hadSlashInQuery = q.Contains('/'), exType = ex.GetType().Name });
            return StatusCode(502, new { error = "Address lookup failed.", detail = ex.Message });
        }

        if (!resp.IsSuccessStatusCode)
        {
            var errBody = await resp.Content.ReadAsStringAsync(cancellationToken);
            AddressSuggestDebugLog.Write(
                "H-mapbox-non-success",
                "Mapbox returned non-success status",
                new
                {
                    status = (int)resp.StatusCode,
                    queryLen = q.Length,
                    hadSlashInQuery = q.Contains('/'),
                    detailLen = errBody.Length,
                });
            return StatusCode(
                StatusCodes.Status502BadGateway,
                new { error = "Geocoding provider returned an error.", status = (int)resp.StatusCode, detail = errBody });
        }

        await using var stream = await resp.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("features", out var features))
            return Ok(new { configured = true, suggestions = Array.Empty<object>() });

        var list = new List<object>();
        foreach (var feat in features.EnumerateArray())
        {
            if (list.Count >= 8) break;
            var parsed = ParseFeature(feat);
            if (parsed is not null) list.Add(parsed);
        }

        return Ok(new { configured = true, suggestions = list });
    }

    private static object? ParseFeature(JsonElement feat)
    {
        var id = feat.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        var placeName = feat.TryGetProperty("place_name", out var pn) ? pn.GetString() : null;
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(placeName)) return null;

        var suburb = "";
        var postcode = "";
        var state = "";
        if (feat.TryGetProperty("context", out var ctx) && ctx.ValueKind == JsonValueKind.Array)
        {
            foreach (var c in ctx.EnumerateArray())
            {
                var cid = c.TryGetProperty("id", out var iid) ? iid.GetString() ?? "" : "";
                var text = c.TryGetProperty("text", out var te) ? te.GetString() ?? "" : "";
                if (cid.StartsWith("locality.", StringComparison.Ordinal)) suburb = text;
                else if (cid.StartsWith("postcode.", StringComparison.Ordinal)) postcode = text;
                else if (cid.StartsWith("region.", StringComparison.Ordinal)) state = text;
                else if (string.IsNullOrEmpty(suburb) && cid.StartsWith("place.", StringComparison.Ordinal)) suburb = text;
            }
        }

        var textMain = feat.TryGetProperty("text", out var tm) ? tm.GetString()?.Trim() ?? "" : "";
        string? number = null;
        if (feat.TryGetProperty("properties", out var props) && props.TryGetProperty("address", out var addrEl))
        {
            number = addrEl.ValueKind switch
            {
                JsonValueKind.String => addrEl.GetString(),
                JsonValueKind.Number => addrEl.GetRawText(),
                _ => null,
            };
        }

        string street;
        if (!string.IsNullOrEmpty(number) && !string.IsNullOrEmpty(textMain)) street = $"{number} {textMain}".Trim();
        else
        {
            var first = placeName.Split(',')[0]?.Trim() ?? "";
            street = string.IsNullOrEmpty(first) ? textMain : first;
        }

        return new { id, placeName, streetAddress = street, suburb, postcode, state };
    }
}
