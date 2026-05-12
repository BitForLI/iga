namespace igaServer.DTOs;

/// <summary>顾客提交退款申请（可选部分商品）。</summary>
public class RefundRequestDto
{
    /// <summary>申请理由；订单状态为 Completed 时必填。</summary>
    public string? Reason { get; set; }

    /// <summary>要退款的订单行 Id（OrderItem.Id）；多商品时至少选一行。</summary>
    public List<int>? ItemIds { get; set; }
}
