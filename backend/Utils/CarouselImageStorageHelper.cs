namespace igaServer.Utils;

/// <summary>首页轮播「入库图」的 URL 约定：<c>/api/store/carousel-image/{guid}</c></summary>
public static class CarouselImageStorageHelper
{
    public const string PublicPathPrefix = "/api/store/carousel-image/";

    public static bool TryParseEmbeddedCarouselId(string? url, out Guid id)
    {
        id = default;
        if (string.IsNullOrWhiteSpace(url)) return false;
        var u = url.Trim();
        if (!u.StartsWith(PublicPathPrefix, StringComparison.Ordinal)) return false;
        var tail = u[PublicPathPrefix.Length..];
        var q = tail.IndexOfAny(['?', '#']);
        if (q >= 0) tail = tail[..q];
        return Guid.TryParse(tail, out id);
    }

    /// <summary>与后台保存校验一致：本地上传路径、https 外链、入库图 API 路径。</summary>
    public static bool IsAllowedCarouselUrl(string u)
    {
        if (string.IsNullOrWhiteSpace(u)) return false;
        u = u.Trim();
        if (u.Length > 2048) return false;
        if (u.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return true;
        if (u.StartsWith("/uploads/", StringComparison.Ordinal)) return true;
        return TryParseEmbeddedCarouselId(u, out _);
    }
}
