using System.ComponentModel.DataAnnotations;

namespace igaServer.Models
{
    public class StoreConfig
    {
        [Key]
        public int Id { get; set; }

        // --- 配送限制 ---
        // 对应功能：配送距离检测
        public double MaxDeliveryDistanceKm { get; set; } = 5.0; // 默认 5km
        public decimal DeliveryBaseFee { get; set; } = 5.0m; // 基础运费（历史字段；配送费以分区为准）
        public decimal FreeDeliveryThreshold { get; set; } = 69.0m; // 满多少免配送费（AUD）

        /// <summary>JSON array of image URLs for the hero carousel: /uploads/..., https://..., or /api/store/carousel-image/{guid} (bytes in StoreCarouselImages).</summary>
        public string HomeCarouselImagesJson { get; set; } = "[]";

        /// <summary>JSON array: [{"suburb":"hurstville","fee":10},...] suburb keys lowercase; empty = default $10 per zone.</summary>
        public string DeliveryZoneFeesJson { get; set; } = "[]";

        // --- 运营设置 ---
        // 对应功能：自提时间选择 (存为 JSON 字符串，如 ["10:00-11:00", "14:00-15:00"])
        public string PickupTimeSlotsJson { get; set; } 
        
        // 对应功能：电子收据上的商家信息
        public string StoreName { get; set; } = "IGA Local";
        public string AbnNumber { get; set; } // 澳洲税务要求

        // --- 通知设置 ---
        // 对应功能：Telegram 推送
        public string TelegramChatId { get; set; } // 商家接收消息的 Chat ID
        public bool IsStoreOpen { get; set; } = true; // 一键打烊
    }
}