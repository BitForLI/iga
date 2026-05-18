using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe.Checkout;
using IGA.Services;
using Stripe;
using igaServer.Data;
using igaServer.Models;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PaymentController : ControllerBase
    {
        private readonly IStripeService _stripeService;
        private readonly IConfiguration _configuration;
        private readonly ApplicationDbContext _context;
        private readonly IResendEmailService _resendEmail;
        private readonly ITelegramNotificationService _telegram;
        private readonly StripeWebhookProcessor _webhookProcessor;
        private readonly ILogger<PaymentController> _logger;

        public PaymentController(
            IStripeService stripeService,
            IConfiguration configuration,
            ApplicationDbContext context,
            IResendEmailService resendEmail,
            ITelegramNotificationService telegram,
            StripeWebhookProcessor webhookProcessor,
            ILogger<PaymentController> logger)
        {
            _stripeService = stripeService;
            _configuration = configuration;
            _context = context;
            _resendEmail = resendEmail;
            _telegram = telegram;
            _webhookProcessor = webhookProcessor;
            _logger = logger;
        }

        // ==========================================
        // 1. 为订单创建 Checkout Session
        // POST: api/payment/create-checkout-session/{orderId}
        // ==========================================
        /// <summary>
        /// 为指定订单创建 Stripe Checkout Session
        /// 1. 读取订单及其 items
        /// 2. 动态构建 line items
        /// 3. 创建 Checkout Session
        /// 4. 保存 StripeSessionId 到订单
        /// 5. 重定向到 Stripe Checkout
        /// </summary>
        [HttpPost("create-checkout-session/{orderId}")]
        public async Task<IActionResult> CreateCheckoutSession(int orderId)
        {
            // 注意：appsettings.Development.json 会覆盖 appsettings.json；若 Development 里 Stripe:SecretKey 为空字符串，会覆盖掉基座里已填的密钥。
            var stripeSecret = (_configuration["Stripe:SecretKey"] ?? "").Trim();
            if (string.IsNullOrWhiteSpace(stripeSecret))
            {
                return BadRequest(new
                {
                    error =
                        "Stripe 未配置：Development 可在 appsettings.Development.json 填写 Stripe:SecretKey，或设置 Stripe__SecretKey / STRIPE_SECRET_KEY；Webhook 签名为 Stripe__WebhookSecret / STRIPE_WEBHOOK_SECRET。获取密钥：https://dashboard.stripe.com/apikeys"
                });
            }

            StripeConfiguration.ApiKey = stripeSecret;
            // 澳洲 Stripe 账户用 usd 创建 Session 常会直接 400；默认 aud，若账户以 USD 结算可改为 usd
            var checkoutCurrency = (_configuration["Stripe:CheckoutCurrency"] ?? "aud").Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(checkoutCurrency))
                checkoutCurrency = "aud";

            // === 步骤 1: 读取订单及其关联商品 ===
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return BadRequest(new { error = "Order not found" });
            }

            if (order.Items == null || order.Items.Count == 0)
            {
                return BadRequest(new { error = "Order has no items" });
            }

            // === 步骤 2: 验证订单状态（必须是 Pending） ===
            if (order.OrderStatus != "Pending")
            {
                return BadRequest(new { error = $"Order status is {order.OrderStatus}, only Pending orders can be paid" });
            }

            // === 步骤 3: 构建 Checkout Session 的 line items ===
            var lineItems = new List<SessionLineItemOptions>();

            foreach (var item in order.Items)
            {
                var isWeighed = item.Product?.IsWeighingRequired == true;
                decimal lineTotal;
                long stripeQty;
                long unitCents;
                if (isWeighed)
                {
                    lineTotal = item.PriceAtPurchase * (decimal)item.ExpectedWeight;
                    if (lineTotal <= 0)
                        return BadRequest(new { error = $"Invalid weighed line amount for {item.ProductName}" });
                    stripeQty = 1;
                    unitCents = (long)Math.Round(lineTotal * 100m, MidpointRounding.AwayFromZero);
                }
                else
                {
                    if (item.Quantity < 1)
                        return BadRequest(new { error = $"Invalid quantity for line item: {item.ProductName}" });
                    lineTotal = item.PriceAtPurchase * item.Quantity;
                    stripeQty = item.Quantity;
                    unitCents = (long)Math.Round(item.PriceAtPurchase * 100m, MidpointRounding.AwayFromZero);
                }

                if (unitCents < 1)
                    return BadRequest(new { error = $"Invalid unit price for {item.ProductName}; Stripe requires a positive amount." });
                lineItems.Add(new SessionLineItemOptions
                {
                    PriceData = new SessionLineItemPriceDataOptions
                    {
                        UnitAmount = unitCents,
                        Currency = checkoutCurrency,
                        ProductData = new SessionLineItemPriceDataProductDataOptions
                        {
                            Name = item.ProductName,
                            Description = $"商品ID: {item.ProductId}"
                        },
                    },
                    Quantity = stripeQty,
                });
            }

            // 配送订单：添加运费行项
            if (order.OrderType == "Delivery")
            {
                var itemsTotal = order.Items.Sum(i =>
                    i.Product?.IsWeighingRequired == true
                        ? i.PriceAtPurchase * (decimal)i.ExpectedWeight
                        : i.PriceAtPurchase * i.Quantity);
                var deliveryFee = order.TotalAmount - itemsTotal;
                if (deliveryFee > 0)
                {
                    var feeCents = (long)Math.Round(deliveryFee * 100m, MidpointRounding.AwayFromZero);
                    if (feeCents >= 1)
                    {
                        lineItems.Add(new SessionLineItemOptions
                        {
                            PriceData = new SessionLineItemPriceDataOptions
                            {
                                UnitAmount = feeCents,
                                Currency = checkoutCurrency,
                                ProductData = new SessionLineItemPriceDataProductDataOptions
                                {
                                    Name = "Delivery Fee",
                                },
                            },
                            Quantity = 1,
                        });
                    }
                }
            }

            // === 步骤 4: 创建 Checkout Session ===
            var successUrlTemplate = _configuration["Stripe:SuccessUrl"] ?? $"http://localhost:5173/?payment=success&orderId={orderId}";
            var cancelUrlTemplate = _configuration["Stripe:CancelUrl"] ?? $"http://localhost:5173/?payment=cancelled&orderId={orderId}";
            var successUrl = successUrlTemplate.Replace("{orderId}", orderId.ToString());
            var cancelUrl = cancelUrlTemplate.Replace("{orderId}", orderId.ToString());

            var options = new SessionCreateOptions
            {
                PaymentMethodTypes = new List<string> { "card" },
                LineItems = lineItems,
                Mode = "payment",
                SuccessUrl = successUrl,
                CancelUrl = cancelUrl,
                ClientReferenceId = orderId.ToString(), // 关联订单 ID
            };

            // No Stripe invoice should be created at checkout; customers already pay during checkout.
            // Order receipts are sent later via Resend email once pickup/delivery is completed.

            var registeredEmail = order.User?.Email?.Trim();
            if (!string.IsNullOrWhiteSpace(registeredEmail) && registeredEmail.Contains('@'))
            {
                options.CustomerEmail = registeredEmail;
            }

            // 部分 Stripe 账户在开启「收集手机号」时创建 Session 会失败；默认关闭，需要时在 appsettings 设 Stripe:CheckoutCollectPhone=true
            if (_configuration.GetValue("Stripe:CheckoutCollectPhone", false))
            {
                options.PhoneNumberCollection = new SessionPhoneNumberCollectionOptions { Enabled = true };
            }

            // 配送单收集收货地址；若仍 400，可在 appsettings 设 Stripe:CheckoutCollectShippingAddress=false 排查
            if (order.OrderType == "Delivery" && _configuration.GetValue("Stripe:CheckoutCollectShippingAddress", true))
            {
                options.ShippingAddressCollection = new SessionShippingAddressCollectionOptions
                {
                    AllowedCountries = new List<string> { "AU", "US", "CA", "GB", "NZ", "CN" },
                };
            }

            try
            {
                var session = await _stripeService.CreateCheckoutSessionAsync(successUrl, cancelUrl, options);

                if (string.IsNullOrEmpty(session.Url))
                {
                    return BadRequest(new { error = "Stripe returned no checkout URL (session.Url is empty). Check Stripe Dashboard / API version." });
                }

                // === 步骤 5: 保存 Session ID 到订单 ===
                order.StripeSessionId = session.Id;
                _context.Orders.Update(order);
                await _context.SaveChangesAsync();

                // === 步骤 6: 返回 Stripe URL，前端用 window.location.href 跳转 ===
                return Ok(new { url = session.Url });
            }
            catch (StripeException ex)
            {
                var code = ex.StripeError?.Code ?? ex.StripeError?.Type ?? "";
                return BadRequest(new
                {
                    error = string.IsNullOrEmpty(code)
                        ? $"Stripe error: {ex.Message}"
                        : $"Stripe error ({code}): {ex.Message}",
                    stripeCode = code,
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = $"Checkout failed: {ex.Message}" });
            }
        }

        /// <summary>
        /// 支付成功后前端回跳时调用：用 Stripe API 查询 Checkout Session，若已付款则把本地订单改为 Paid。
        /// 解决本地开发 Stripe Webhook 无法访问 localhost 导致订单一直 Pending 的问题（与 Dashboard 里「已付款」不同步）。
        /// </summary>
        [HttpPost("sync-order-after-checkout/{orderId}")]
        public async Task<IActionResult> SyncOrderAfterCheckout(int orderId)
        {
            var stripeSecret = (_configuration["Stripe:SecretKey"] ?? "").Trim();
            if (string.IsNullOrWhiteSpace(stripeSecret))
            {
                return BadRequest(new { error = "Stripe 未配置 SecretKey" });
            }

            StripeConfiguration.ApiKey = stripeSecret;

            var order = await _context.Orders.FindAsync(orderId);
            if (order == null)
            {
                return NotFound(new { error = "Order not found" });
            }

            if (string.IsNullOrEmpty(order.StripeSessionId))
            {
                return BadRequest(new { error = "订单未关联 Stripe Checkout Session，无法同步" });
            }

            try
            {
                var sessionService = new SessionService();
                var session = await sessionService.GetAsync(order.StripeSessionId);

                if (session.ClientReferenceId != orderId.ToString())
                {
                    return BadRequest(new { error = "Stripe Session 与订单不匹配" });
                }

                var paid = string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase);

                if (!paid)
                {
                    return Ok(new
                    {
                        orderStatus = order.OrderStatus,
                        synced = false,
                        stripePaymentStatus = session.PaymentStatus,
                        message = "Stripe 侧尚未标记为已支付"
                    });
                }

                if (order.OrderStatus == "Paid")
                {
                    return Ok(new { orderStatus = order.OrderStatus, synced = false, message = "订单已是 Paid" });
                }

                order.OrderStatus = "Paid";
                if (!string.IsNullOrEmpty(session.PaymentIntentId))
                {
                    order.StripePaymentIntentId = session.PaymentIntentId;
                }

                await _context.SaveChangesAsync();

                try
                {
                    await OrderPaidNotifier.TryNotifyPickupEmailAsync(
                        _context,
                        _resendEmail,
                        orderId,
                        _logger,
                        session.CustomerDetails?.Email ?? session.CustomerEmail,
                        _configuration["Store:PickupAddress"] ?? "IGA Beverly Hills",
                        HttpContext.RequestAborted);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[Payment] 取件码邮件发送失败 order {OrderId}", orderId);
                }

                try
                {
                    await _telegram.NotifyOrderPaidAsync(orderId, HttpContext.RequestAborted);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[Payment] Telegram paid-order notification failed order {OrderId}", orderId);
                }

                return Ok(new { orderStatus = order.OrderStatus, synced = true });
            }
            catch (StripeException ex)
            {
                return BadRequest(new { error = $"Stripe: {ex.Message}" });
            }
        }

        // ==========================================
        // 2. Webhook 处理支付回调
        // POST: api/payment/webhook（Stripe Dashboard 若填 …/api/stripe/webhook，Program.cs 会在路由前重写为同一路径）
        // ==========================================
        /// <summary>
        /// 处理 Stripe webhook 事件
        /// 监听 checkout.session.completed 事件
        /// 1. 验证签名
        /// 2. 找到对应订单
        /// 3. 更新订单状态为 Paid
        /// 4. 可选：发送确认邮件/Telegram 通知
        /// </summary>
        [HttpPost("webhook")]
        public async Task<IActionResult> Webhook(CancellationToken cancellationToken)
        {
            using var reader = new StreamReader(Request.Body);
            var json = await reader.ReadToEndAsync(cancellationToken);
            var sig = Request.Headers["Stripe-Signature"].ToString();
            var (status, body) = await _webhookProcessor.ProcessAsync(json, sig, cancellationToken);
            return body == null ? StatusCode(status) : StatusCode(status, body);
        }
    }
}
