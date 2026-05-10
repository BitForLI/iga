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
    /// 核销订单请求 DTO（与邮件中的 6 位取货码一致）
    /// </summary>
    public class OrderVerifyDto
    {
        public string PickupCode { get; set; } = "";
    }
}
