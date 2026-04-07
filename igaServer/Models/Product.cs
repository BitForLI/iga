using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace igaServer.Models
{
    public class Product
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string Name { get; set; }

        public string ImageUrl { get; set; }

        public string Category { get; set; } // "Veggie", "Meat"

        [Column(TypeName = "decimal(18,2)")]
        public decimal Price { get; set; } // 单价/卖价

        /// <summary>成本价（仅后台可见，用于计算利润率）</summary>
        [Column(TypeName = "decimal(18,2)")]
        public decimal CostPrice { get; set; } // 成本价

        public string Unit { get; set; } // kg, ea, box

        public int StockQuantity { get; set; } // 库存

        public bool IsActive { get; set; } = true; // 上下架

        /// <summary>Stripe Product ID（后台同步后写入）</summary>
        [StringLength(64)]
        public string? StripeProductId { get; set; }

        /// <summary>Stripe Price ID（结账行项目用）</summary>
        [StringLength(64)]
        public string? StripePriceId { get; set; }

        // --- 核心业务字段 ---
        public bool IsWeighingRequired { get; set; } // 是否是称重商品（决定是否需要二次退款）
    }
}