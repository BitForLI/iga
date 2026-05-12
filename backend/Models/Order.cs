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

        public string? RefundRequestPreviousStatus { get; set; } // 申请退款前的订单状态

        public string? RefundRejectionReason { get; set; } // 拒绝退款原因

        /// <summary>顾客申请退款时填写的理由（已完成订单必填）。</summary>
        public string? RefundRequestReason { get; set; }

        /// <summary>JSON 数组：申请退款的 OrderItem Id 列表（部分退款）。</summary>
        public string? RefundRequestedItemIdsJson { get; set; }

        // --- 履约信息 ---
        public string? OrderStatus { get; set; } = "Pending"; // Pending, Paid, Prepared, Completed
        public string? PickupCode { get; set; } // 6 位数字取货码（创建订单时生成）
        public string? OrderType { get; set; } // "Pickup" 或 "Delivery"
        
        public DateTime? PickupTime { get; set; } // 预约时间
        public string? DeliveryAddress { get; set; } // 配送地址
        /// <summary>配送郊区（与下单时 DeliverySuburb 一致，便于员工按区筛选）。</summary>
        public string? DeliverySuburb { get; set; }
        public double? DeliveryDistanceKm { get; set; } // 配送距离

        /// <summary>顾客已取货/已交接时间；仍为 Prepared，在后台「Completed *」列表中展示。</summary>
        public DateTime? PickedUpAt { get; set; }

        // --- 关联 ---
        public List<OrderItem>? Items { get; set; } // 购买的商品列表

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}