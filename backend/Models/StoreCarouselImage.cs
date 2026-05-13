namespace igaServer.Models;

/// <summary>
/// 首页轮播图二进制，与 <see cref="StoreConfig.HomeCarouselImagesJson"/> 中的 <c>/api/store/carousel-image/{id}</c> 对应。
/// 备份数据库即可保留图片，不依赖服务器本地 uploads 目录。
/// </summary>
public class StoreCarouselImage
{
    public Guid Id { get; set; }

    public byte[] ImageBytes { get; set; } = Array.Empty<byte>();

    /// <summary>e.g. image/jpeg</summary>
    public string ContentType { get; set; } = "application/octet-stream";

    public DateTime CreatedAtUtc { get; set; }
}
