namespace igaServer.DTOs
{
    /// <summary>
    /// 称重更新 DTO
    /// 商家在核销时输入实际重量，触发差价退款
    /// </summary>
    public class WeightUpdateDto
    {
        public int OrderItemId { get; set; }

        public double ActualWeight { get; set; }
    }

    /// <summary>
    /// 核销订单请求 DTO
    /// 验证手机后四位 -> 订单完成
    /// </summary>
    public class OrderVerifyDto
    {
        public int OrderId { get; set; }

        public string PhoneLast4Digits { get; set; } // 用户手机号后四位
    }
}
