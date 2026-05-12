using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace igaServer.Models
{
    public class OrderItem
    {
        [Key]
        public int Id { get; set; }

        public int OrderId { get; set; }
        public Order Order { get; set; } // 关联主订单

        public int ProductId { get; set; }
        public Product Product { get; set; }

        public string ProductName { get; set; } // 冗余存名称，防止商品删除后报表出错

        public int Quantity { get; set; } // 购买数量

        [Column(TypeName = "decimal(18,2)")]
        public decimal PriceAtPurchase { get; set; } // 下单时的单价

        // --- 称重差价逻辑 ---
        public double ExpectedWeight { get; set; } // 预估重量 (如 1.0kg)
        public double? ActualWeight { get; set; }  // 实际重量 (商家填写，如 0.85kg)

        /// <summary>顾客部分退款已处理完成（该行不再可申请退款）。</summary>
        public DateTime? CustomerRefundCompletedAt { get; set; }

        // 计算属性：该条目的最终金额
        // 如果是普通商品，就是 单价 * 数量
        // 如果是称重商品，后续会根据 ActualWeight 更新
    }
}