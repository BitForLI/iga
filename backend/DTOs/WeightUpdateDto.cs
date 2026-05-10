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
    /// 验证取件码（6位数字）-> 订单完成
    /// </summary>
    public class OrderVerifyDto
    {
        public int OrderId { get; set; }

        public string PickupCode { get; set; } // 邮件中的6位取件码
    }
}
