namespace igaServer.DTOs
{
    /// <summary>
    /// 订单详情返回 DTO
    /// 用于返回订单的完整信息
    /// </summary>
    public class OrderDetailDto
    {
        public int Id { get; set; }

        public int UserId { get; set; }

        public string UserName { get; set; }

        public string UserPhone { get; set; }

        // 金额信息
        public decimal TotalAmount { get; set; }

        public decimal? FinalAmount { get; set; }

        public decimal RefundAmount { get; set; }

        public string? RefundRejectionReason { get; set; }

        // 订单状态
        public string OrderStatus { get; set; } // Pending, Paid, Prepared, Completed

        public string OrderType { get; set; }

        // Stripe 支付流水（方便对账/退款）
        public string StripeSessionId { get; set; }
        public string StripePaymentIntentId { get; set; }

        // 履约信息
        public string PickupCode { get; set; } // 6 位取货码

        public DateTime? PickupTime { get; set; }

        public string DeliveryAddress { get; set; }

        public double? DeliveryDistanceKm { get; set; }

        public DateTime? PickedUpAt { get; set; }

        // 商品列表
        public List<OrderItemDetailDto> Items { get; set; }

        public DateTime CreatedAt { get; set; }
    }

    public class OrderItemDetailDto
    {
        public int Id { get; set; }

        public int ProductId { get; set; }

        public string ProductName { get; set; }

        public int Quantity { get; set; }

        public decimal PriceAtPurchase { get; set; }

        public double ExpectedWeight { get; set; }

        public double? ActualWeight { get; set; }

        /// <summary>是否称重商品（需录入实重后退差价）</summary>
        public bool IsWeighingRequired { get; set; }

        // 计算该条目的小计
        public decimal Subtotal => PriceAtPurchase * Quantity;
    }
}
