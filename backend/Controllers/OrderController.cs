using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using IGA.Services;
using igaServer.Data;
using igaServer.Models;
using igaServer.DTOs;
using igaServer.Utils;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class OrderController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IStripeService _stripeService;
        private readonly ITelegramNotificationService _telegram;
        private readonly ILogger<OrderController> _logger;

        public OrderController(
            ApplicationDbContext context,
            IStripeService stripeService,
            ITelegramNotificationService telegram,
            ILogger<OrderController> logger)
        {
            _context = context;
            _stripeService = stripeService;
            _telegram = telegram;
            _logger = logger;
        }

        // ==========================================
        // 1. 创建订单（购物车转订单）
        // POST: api/order/create
        // ==========================================
        [HttpPost("create")]
        public async Task<ActionResult<OrderDetailDto>> CreateOrder([FromBody] OrderCreateDto request)
        {
            // === 步骤 1: 验证用户存在（不再自动创建 Guest/初始用户） ===
            User user;
            if (request.UserId == 0)
            {
                return BadRequest(new { error = "Please sign in before checkout" });
            }
            else
            {
                user = await _context.Users.FindAsync(request.UserId);
                if (user == null) return BadRequest(new { error = "User not found" });
            }

            // === 步骤 2: 验证购物车不为空 ===
            if (request.Items == null || request.Items.Count == 0)
            {
                return BadRequest(new { error = "Cart is empty" });
            }

            // === 步骤 3: 获取商品信息（验证商品存在且上架） ===
            var productIds = request.Items.Select(x => x.ProductId).ToList();
            var products = await _context.Products
                .Where(p => productIds.Contains(p.Id))
                .ToListAsync();

            foreach (var item in request.Items)
            {
                var product = products.FirstOrDefault(p => p.Id == item.ProductId);
                if (product == null)
                {
                    return BadRequest(new { error = $"Product {item.ProductId} not found" });
                }

                if (!product.IsActive)
                {
                    return BadRequest(new { error = $"Product {product.Name} is not available" });
                }
            }

            // === 步骤 3.5: 配送订单需校验区域（运费在商品小计后按分区 + 满额包邮计算） ===
            if (request.OrderType == "Delivery")
            {
                var suburb = (request.DeliverySuburb ?? "").Trim();
                if (string.IsNullOrEmpty(suburb))
                    return BadRequest(new { error = "Please select delivery suburb" });
                if (!StoreDeliveryHelper.IsAllowedSuburb(suburb))
                {
                    var names = string.Join(", ", StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(StoreDeliveryHelper.DisplaySuburb));
                    return BadRequest(new { error = $"We only deliver to {names}" });
                }
            }

            // === 步骤 4: 创建订单对象 ===
            var order = new Order
            {
                UserId = user.Id,
                OrderType = request.OrderType, // "Pickup" 或 "Delivery"
                OrderStatus = "Pending", // 初始状态：待支付
                PickupTime = request.PickupTime.HasValue ? DateTime.SpecifyKind(request.PickupTime.Value, DateTimeKind.Utc) : null, // 转换为 UTC
                DeliveryAddress = request.DeliveryAddress,
                Items = new List<OrderItem>()
            };

            // === 步骤 5: 添加订单项 ===
            decimal totalAmount = 0;

            foreach (var item in request.Items)
            {
                var product = products.First(p => p.Id == item.ProductId);

                decimal lineAmount;
                var orderItem = new OrderItem
                {
                    ProductId = product.Id,
                    ProductName = product.Name,
                    PriceAtPurchase = product.Price,
                };

                if (product.IsWeighingRequired)
                {
                    var w = item.ExpectedWeight;
                    if (w <= 0 || double.IsNaN(w) || double.IsInfinity(w))
                    {
                        return BadRequest(new { error = $"Estimated weight (kg) is required for weighed item: {product.Name}" });
                    }

                    orderItem.Quantity = 1;
                    orderItem.ExpectedWeight = w;
                    lineAmount = product.Price * (decimal)w;
                }
                else
                {
                    if (item.Quantity < 1)
                    {
                        return BadRequest(new { error = $"Invalid quantity for {product.Name}" });
                    }

                    orderItem.Quantity = item.Quantity;
                    orderItem.ExpectedWeight = item.ExpectedWeight > 0 ? item.ExpectedWeight : 0;
                    lineAmount = product.Price * item.Quantity;
                }

                order.Items.Add(orderItem);
                totalAmount += lineAmount;
            }

            // 配送订单：分区运费（StoreConfigs.DeliveryZoneFeesJson，空则每区默认 $10），满 FreeDeliveryThreshold 包邮
            if (request.OrderType == "Delivery")
            {
                var store = await _context.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync();
                var freeMin = store != null && store.FreeDeliveryThreshold > 0
                    ? store.FreeDeliveryThreshold
                    : StoreDeliveryHelper.DefaultFreeShippingMinAud;
                var itemsSubtotal = totalAmount;
                var deliveryFee = StoreDeliveryHelper.ComputeDeliveryFeeAud(
                    request.DeliverySuburb,
                    itemsSubtotal,
                    store?.DeliveryZoneFeesJson,
                    freeMin);
                totalAmount += deliveryFee;
            }

            order.TotalAmount = totalAmount;

            // === 步骤 6: 取件码（6 位数字，支付成功后邮件通知） ===
            order.PickupCode = GeneratePickupCode();

            // === 步骤 7: 保存到数据库 ===
            _context.Orders.Add(order);
            await _context.SaveChangesAsync();

            // === 步骤 7.5: Telegram 新订单通知（失败不影响下单） ===
            try
            {
                await _telegram.NotifyNewOrderCreatedAsync(order, user, HttpContext.RequestAborted);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[Order] Telegram 新订单通知失败 orderId={OrderId}", order.Id);
            }

            // === 步骤 8: 返回订单详情（后续会添加 Stripe PaymentIntent） ===
            return Ok(new { message = "Order created", orderId = order.Id, totalAmount = order.TotalAmount });
        }

        // ==========================================
        // 2. 获取订单详情
        // GET: api/order/{orderId}
        // ==========================================
        [HttpGet("{orderId}")]
        public async Task<ActionResult<OrderDetailDto>> GetOrder(int orderId)
        {
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound("Order not found");
            }

            var dto = MapToOrderDetailDto(order);
            return Ok(dto);
        }

        // ==========================================
        // 3. 获取用户的所有订单
        // GET: api/order/user/{userId}
        // ==========================================
        [HttpGet("user/{userId}")]
        public async Task<ActionResult<List<OrderDetailDto>>> GetUserOrders(int userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
            {
                return BadRequest("用户不存在");
            }

            var orders = await _context.Orders
                .Where(o => o.UserId == userId)
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

            var dtos = orders.Select(o => MapToOrderDetailDto(o)).ToList();
            return Ok(dtos);
        }

        // ==========================================
        // 4. 顾客申请退款
        // POST: api/order/{orderId}/refund-request
        // ==========================================
        [HttpPost("{orderId}/refund-request")]
        public async Task<ActionResult<OrderDetailDto>> RequestRefund(
            int orderId,
            [FromHeader(Name = "X-User-Id")] int userId)
        {
            if (userId <= 0)
            {
                return Unauthorized(new { error = "Sign in required" });
            }

            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound(new { error = "Order not found" });
            }

            if (order.UserId != userId)
            {
                return StatusCode(403, new { error = "You can only request refund for your own order" });
            }

            if (order.OrderStatus == "RefundRequested")
            {
                return Ok(MapToOrderDetailDto(order));
            }

            var refundableStatuses = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "Paid",
                "Preparing",
                "Prepared",
                "Completed"
            };

            if (!refundableStatuses.Contains(order.OrderStatus ?? ""))
            {
                return BadRequest(new { error = $"Order status is {order.OrderStatus}; refund request is not available" });
            }

            order.RefundRequestPreviousStatus = order.OrderStatus;
            order.RefundRejectionReason = null;
            order.OrderStatus = "RefundRequested";
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();

            return Ok(MapToOrderDetailDto(order));
        }

        // ==========================================
        // 5. 更新订单状态（仅 Admin 可用）
        // PUT: api/order/{orderId}/status
        // ==========================================
        /// <summary>
        /// 管理员更新订单状态
        /// Pending -> Paid -> Prepared -> Completed
        /// </summary>
        [HttpPut("{orderId}/status")]
        public async Task<ActionResult<OrderDetailDto>> UpdateOrderStatus(
            int orderId,
            [FromBody] UpdateOrderStatusRequest request,
            [FromHeader(Name = "X-Admin-Id")] int adminId)
        {
            // 验证操作者是否为 Admin
            var admin = await _context.Users.FindAsync(adminId);
            if (admin == null || admin.Role != "Admin")
            {
                return Unauthorized("Only admin can perform this action");
            }

            // 查找订单
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound("Order not found");
            }

            // 验证状态流转
            var validStatusTransitions = new Dictionary<string, List<string>>
            {
                { "Pending", new List<string> { "Paid", "Cancelled" } },
                { "Paid", new List<string> { "Preparing", "Cancelled" } },
                { "Preparing", new List<string> { "Prepared", "Cancelled" } },
                { "Prepared", new List<string> { "Completed", "Cancelled" } },
                { "RefundRequested", new List<string> { "Cancelled" } },
                { "Completed", new List<string>() },
                { "Cancelled", new List<string>() }
            };

            if (!validStatusTransitions.ContainsKey(order.OrderStatus) || 
                !validStatusTransitions[order.OrderStatus].Contains(request.NewStatus))
            {
                return BadRequest($"Cannot transition from {order.OrderStatus} to {request.NewStatus}");
            }

            // 更新订单状态
            order.OrderStatus = request.NewStatus;
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();

            var dto = MapToOrderDetailDto(order);
            return Ok(dto);
        }

        // ==========================================
        // 6. 核销订单（6 位取货码验证）
        // POST: api/order/{orderId}/verify
        // ==========================================
        /// <summary>
        /// 验证订单取货
        /// 1. 检查订单状态是否为 Prepared（已备货）
        /// 2. 验证邮件中的 6 位取货码是否与订单 PickupCode 一致
        /// 3. 订单标记为 Completed
        /// 4. 返回订单信息
        /// </summary>
        [HttpPost("{orderId}/verify")]
        public async Task<ActionResult<OrderDetailDto>> VerifyOrder(int orderId, [FromBody] OrderVerifyDto request)
        {
            // 查找订单
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);

            if (order == null)
            {
                return NotFound("Order not found");
            }

            // 检查订单状态
            if (order.OrderStatus != "Prepared")
            {
                return BadRequest($"Order status is {order.OrderStatus}, can only verify prepared orders");
            }

            var expected = order.PickupCode ?? "";
            var entered = NormalizePickupDigits(request.PickupCode);
            if (expected.Length != 6 || entered.Length != 6 || entered != expected)
            {
                return BadRequest("Invalid pickup code");
            }

            // 更新订单状态为已完成
            order.OrderStatus = "Completed";
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();

            var dto = MapToOrderDetailDto(order);
            return Ok(new { message = "Order verified", order = dto });
        }

        // ==========================================
        // 7. 更新订单项重量（称重退款逻辑）
        // PUT: api/order/item/{itemId}/weight
        // ==========================================
        /// <summary>
        /// 称重退款：按「预估 − 实际」计算本行应退总额；相对上次录入计算**增量**退款，避免重复提交时累计错误。
        /// 已支付且存在 StripePaymentIntentId 时，对 PaymentIntent 发起部分退款（Stripe）。
        /// 若新实际重量比上次更轻（应减少已退金额），Stripe 无法自动收回已退款，接口会拒绝并提示人工处理。
        /// </summary>
        [HttpPut("item/{itemId}/weight")]
        public async Task<ActionResult<OrderItemDetailDto>> UpdateItemWeight(
            int itemId,
            [FromBody] WeightUpdateDto request,
            [FromHeader(Name = "X-Admin-Id")] int adminId)
        {
            // 员工或管理员可录入实重（触发 Stripe 部分退款）
            var admin = await _context.Users.FindAsync(adminId);
            if (admin == null || (admin.Role != "Admin" && admin.Role != "Staff"))
            {
                return Unauthorized("Only staff or admin can update item weight");
            }

            // 查找订单项
            var orderItem = await _context.OrderItems
                .Include(oi => oi.Product)
                .Include(oi => oi.Order)
                .FirstOrDefaultAsync(oi => oi.Id == itemId);

            if (orderItem == null)
            {
                return NotFound("Order item not found");
            }

            // 验证商品是否需要称重
            if (!orderItem.Product.IsWeighingRequired)
            {
                return BadRequest($"Product {orderItem.Product.Name} does not require weighing");
            }

            var order = orderItem.Order;
            var previousActual = orderItem.ActualWeight;

            // 购物车里的 Quantity 对称重商品表示预估购买重量；不要再乘一次 Quantity，否则会把退款放大。
            decimal expectedTotalWeight = (decimal)orderItem.ExpectedWeight;
            decimal newActualTotalWeight = (decimal)request.ActualWeight;
            decimal oldActualTotalWeight = previousActual.HasValue
                ? (decimal)previousActual.Value
                : newActualTotalWeight;

            decimal refundPerKg = orderItem.PriceAtPurchase;

            static decimal LineRefundForWeight(decimal expectedKg, decimal actualKg, decimal pricePerKg)
            {
                var diff = expectedKg - actualKg;
                if (diff <= 0) return 0;
                return pricePerKg * diff;
            }

            decimal newLineRefund = LineRefundForWeight(expectedTotalWeight, newActualTotalWeight, refundPerKg);
            decimal oldLineRefund = previousActual.HasValue
                ? LineRefundForWeight(expectedTotalWeight, oldActualTotalWeight, refundPerKg)
                : 0;
            decimal requestedDeltaRefund = newLineRefund - oldLineRefund;
            decimal refundableRemaining = Math.Max(0, order.TotalAmount - order.RefundAmount);
            decimal deltaRefund = requestedDeltaRefund > 0
                ? Math.Min(requestedDeltaRefund, refundableRemaining)
                : requestedDeltaRefund;
            var canStripeRefund = deltaRefund > 0.01m &&
                !string.IsNullOrWhiteSpace(order.StripePaymentIntentId) &&
                !string.Equals(order.OrderStatus, "Pending", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(order.OrderStatus, "Cancelled", StringComparison.OrdinalIgnoreCase);

            if (deltaRefund < -0.01m)
            {
                return BadRequest(new
                {
                    error =
                        "本次录入的实际重量比上次更重，按业务应减少已退差价；Stripe 无法自动收回已发起的退款，请通过 Stripe 后台人工处理或联系客服。",
                    deltaRefund,
                });
            }

            // 已支付且已关联 PaymentIntent：Stripe 部分退款（仅增量 > 0）
            string? stripeRefundId = null;
            if (deltaRefund > 0.01m)
            {
                if (!canStripeRefund)
                {
                    return BadRequest(new
                    {
                        error = "订单未关联可退款的 Stripe PaymentIntent，无法自动退款。",
                        orderStatus = order.OrderStatus,
                        hasPaymentIntent = !string.IsNullOrWhiteSpace(order.StripePaymentIntentId),
                    });
                }

                var minorUnits = (long)Math.Round(deltaRefund * 100m, MidpointRounding.AwayFromZero);
                if (minorUnits < 1)
                {
                    return BadRequest(new { error = "退款金额过小，无法通过 Stripe 处理（最小 1 分）。" });
                }

                if (refundableRemaining <= 0.01m)
                {
                    return BadRequest(new
                    {
                        error = "该订单可退金额已用完，不能超过实付金额。",
                        orderTotal = order.TotalAmount,
                        refundedSoFar = order.RefundAmount,
                        requestedDeltaRefund,
                    });
                }

                var idempotencyKey = $"weigh-refund-{order.Id}-item-{itemId}-{minorUnits}-{newActualTotalWeight:0.####}";
                var (ok, errMsg, refundId) = await _stripeService.CreatePartialRefundAsync(
                    order.StripePaymentIntentId!,
                    minorUnits,
                    idempotencyKey,
                    HttpContext.RequestAborted);

                if (!ok)
                {
                    _logger.LogError("[Order] Stripe 部分退款失败 order={OrderId} item={ItemId} amountMinor={Minor} {Error}",
                        order.Id, itemId, minorUnits, errMsg);
                    return StatusCode(502, new { error = "Stripe 退款失败", detail = errMsg });
                }

                stripeRefundId = refundId;
                _logger.LogInformation(
                    "[Order] Stripe 部分退款成功 order={OrderId} item={ItemId} amountMinor={Minor} refundId={RefundId}",
                    order.Id, itemId, minorUnits, stripeRefundId);
            }

            // 持久化：先写重量与订单金额
            orderItem.ActualWeight = request.ActualWeight;
            _context.OrderItems.Update(orderItem);

            if (deltaRefund != 0)
            {
                order.RefundAmount += deltaRefund;
                order.FinalAmount = order.TotalAmount - order.RefundAmount;
                _context.Orders.Update(order);
            }

            await _context.SaveChangesAsync();

            var itemDto = MapToOrderItemDetailDto(orderItem);
            return Ok(new
            {
                message = deltaRefund > 0.01m
                    ? (stripeRefundId != null
                        ? "Weight updated; Stripe refund processed."
                        : "Weight updated; refund recorded (order not paid via Stripe).")
                    : "Weight updated.",
                orderItem = itemDto,
                refundInfo = new
                {
                    expectedWeight = orderItem.ExpectedWeight,
                    actualWeight = request.ActualWeight,
                    newLineRefund,
                    oldLineRefund,
                    requestedDeltaRefund,
                    deltaRefund,
                    refundableRemaining,
                    cappedByPaidAmount = requestedDeltaRefund > deltaRefund,
                    stripeRefundId,
                    needsRefund = newLineRefund > 0,
                },
            });
        }

        // ==========================================
        // 辅助方法：DTO 映射
        // ==========================================

        private OrderDetailDto MapToOrderDetailDto(Order order)
        {
            return new OrderDetailDto
            {
                Id = order.Id,
                UserId = order.UserId,
                UserName = order.User?.Name,
                UserPhone = order.User?.PhoneNumber,
                TotalAmount = order.TotalAmount,
                FinalAmount = order.FinalAmount,
                RefundAmount = order.RefundAmount,
                RefundRejectionReason = order.RefundRejectionReason,
                OrderStatus = order.OrderStatus,
                OrderType = order.OrderType,
                StripeSessionId = order.StripeSessionId,
                StripePaymentIntentId = order.StripePaymentIntentId,
                PickupCode = order.PickupCode,
                PickupTime = order.PickupTime,
                DeliveryAddress = order.DeliveryAddress,
                DeliveryDistanceKm = order.DeliveryDistanceKm,
                PickedUpAt = order.PickedUpAt,
                Items = order.Items?.Select(oi => MapToOrderItemDetailDto(oi)).ToList(),
                CreatedAt = order.CreatedAt
            };
        }

        private static string GeneratePickupCode() =>
            Random.Shared.Next(100000, 1000000).ToString("D6");

        /// <summary>仅保留数字，用于比对取货码（允许用户粘贴带空格等）。</summary>
        private static string NormalizePickupDigits(string? input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            return new string(input.Where(char.IsDigit).ToArray());
        }

        private static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
        {
            const double R = 6371;
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return R * c;
        }

        private OrderItemDetailDto MapToOrderItemDetailDto(OrderItem item)
        {
            return new OrderItemDetailDto
            {
                Id = item.Id,
                ProductId = item.ProductId,
                ProductName = item.ProductName,
                Quantity = item.Quantity,
                PriceAtPurchase = item.PriceAtPurchase,
                ExpectedWeight = item.ExpectedWeight,
                ActualWeight = item.ActualWeight,
                IsWeighingRequired = item.Product?.IsWeighingRequired ?? false,
            };
        }
    }

    // ==========================================
    // 请求 DTO
    // ==========================================
    public class UpdateOrderStatusRequest
    {
        public string NewStatus { get; set; } // Pending, Paid, Prepared, Completed, Cancelled
    }
}
