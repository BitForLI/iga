namespace igaServer.DTOs
{
    /// <summary>
    /// 创建订单请求 DTO
    /// 前端提交购物车 -> 后端创建订单
    /// </summary>
    public class OrderCreateDto
    {
        public int UserId { get; set; }

        public string? OrderType { get; set; } // "Pickup" 或 "Delivery"

        public DateTime? PickupTime { get; set; }

        public string? DeliveryAddress { get; set; } // 改为可空
        public string? DeliverySuburb { get; set; } // 配送区，用于校验与计算运费

        // 购物车内容：商品ID + 数量
        public List<OrderItemCreateDto> Items { get; set; }
    }

    public class OrderItemCreateDto
    {
        public int ProductId { get; set; }
        public int Quantity { get; set; }
        public double ExpectedWeight { get; set; } // 预估重量（称重商品需要）
    }
}
