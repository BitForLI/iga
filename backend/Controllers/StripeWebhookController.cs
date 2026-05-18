using IGA.Services;
using Microsoft.AspNetCore.Mvc;

namespace igaServer.Controllers;

/// <summary>
/// Stripe Dashboard 常用 URL：<c>https://api.…/api/stripe/webhook</c>（与 <see cref="PaymentController"/> 的 <c>api/payment/webhook</c> 等价）。
/// </summary>
[Route("api/stripe")]
[ApiController]
public class StripeWebhookController : ControllerBase
{
    private readonly StripeWebhookProcessor _processor;

    public StripeWebhookController(StripeWebhookProcessor processor) => _processor = processor;

    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook(CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(Request.Body);
        var json = await reader.ReadToEndAsync(cancellationToken);
        var sig = Request.Headers["Stripe-Signature"].ToString();
        var (status, body) = await _processor.ProcessAsync(json, sig, cancellationToken);
        return body == null ? StatusCode(status) : StatusCode(status, body);
    }
}
