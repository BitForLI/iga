using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace igaServer.Models
{
    public class Order
    {
        [Key]
        public int Id { get; set; }

        public int UserId { get; set; }
        public User User { get; set; }

        // --- 支付与退款 ---
        public string? StripeSessionId { get; set; } // Stripe Checkout Session ID
        
        public string? StripePaymentIntentId { get; set; } // Stripe 交易号 (退款必须用这个)
        
        [Column(TypeName = "decimal(18,2)")]
        public decimal TotalAmount { get; set; } // 预付总金额

        [Column(TypeName = "decimal(18,2)")]
        public decimal? FinalAmount { get; set; } // 称重后的实际金额

        [Column(TypeName = "decimal(18,2)")]
        public decimal RefundAmount { get; set; } // 已退款金额

        // --- 履约信息 ---
        public string? OrderStatus { get; set; } = "Pending"; // Pending, Paid, Prepared, Completed
        public string? PickupCode { get; set; } // 手机后四位
        public string? OrderType { get; set; } // "Pickup" 或 "Delivery"
        
        public DateTime? PickupTime { get; set; } // 预约时间
        public string? DeliveryAddress { get; set; } // 配送地址
        public double? DeliveryDistanceKm { get; set; } // 配送距离

        /// <summary>顾客已取货/已交接（Ready 列表内置底）；仍为 Prepared 状态。</summary>
        public DateTime? PickedUpAt { get; set; }

        // --- 关联 ---
        public List<OrderItem>? Items { get; set; } // 购买的商品列表

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}