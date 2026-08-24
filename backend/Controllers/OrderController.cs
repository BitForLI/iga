using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using IGA.Services;
using igaServer.Data;
using igaServer.Models;
using igaServer.DTOs;
using igaServer.Utils;
using System.Text.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using System.Data;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    [EnableRateLimiting("orders")]
    public class OrderController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IStripeService _stripeService;
        private readonly IOrderCompletionReceiptSender _completionReceiptSender;
        private readonly ILogger<OrderController> _logger;

        public OrderController(
            ApplicationDbContext context,
            IStripeService stripeService,
            IOrderCompletionReceiptSender completionReceiptSender,
            ILogger<OrderController> logger)
        {
            _context = context;
            _stripeService = stripeService;
            _completionReceiptSender = completionReceiptSender;
            _logger = logger;
        }

        // ==========================================
        // 1. 创建订单（购物车转订单）
        // POST: api/order/create
        // ==========================================
        [HttpPost("create")]
        public async Task<ActionResult<OrderDetailDto>> CreateOrder([FromBody] OrderCreateDto request)
        {
            if (request == null) return BadRequest(new { error = "Invalid JSON body" });
            if (!TryGetCurrentUserId(out var currentUserId)) return Unauthorized();
            var user = await _context.Users.FindAsync(currentUserId);
            if (user == null || !user.EmailVerified) return Unauthorized();

            var clientRequestId = request.ClientRequestId?.Trim().ToLowerInvariant();
            if (!Guid.TryParseExact(clientRequestId, "D", out _))
            {
                return BadRequest(new { error = "ClientRequestId must be a UUID. Refresh the page and try again." });
            }

            var existingOrder = await _context.Orders.AsNoTracking()
                .FirstOrDefaultAsync(o => o.UserId == currentUserId && o.ClientRequestId == clientRequestId);
            if (existingOrder != null)
            {
                return Ok(new
                {
                    message = "Order already created",
                    orderId = existingOrder.Id,
                    totalAmount = existingOrder.TotalAmount,
                    idempotentReplay = true,
                });
            }

            // === 步骤 2: 验证购物车不为空 ===
            if (request.Items == null || request.Items.Count == 0 || request.Items.Count > 100)
            {
                return BadRequest(new { error = "Cart must contain between 1 and 100 items" });
            }
            var orderType = (request.OrderType ?? "").Trim();
            if (orderType != "Pickup" && orderType != "Delivery")
                return BadRequest(new { error = "OrderType must be Pickup or Delivery" });
            if ((request.DeliveryAddress?.Length ?? 0) > 500 || (request.DeliverySuburb?.Length ?? 0) > 100)
                return BadRequest(new { error = "Delivery details are too long" });
            if (request.PickupTime is { } pickup && (pickup < DateTime.UtcNow.AddMinutes(-5) || pickup > DateTime.UtcNow.AddDays(30)))
                return BadRequest(new { error = "Pickup time must be within the next 30 days" });

            // === 步骤 3: 获取商品信息（验证商品存在且上架） ===
            var productIds = request.Items.Select(x => x.ProductId).ToList();
            var products = await _context.Products
                .Where(p => productIds.Contains(p.Id))
                .ToListAsync();

            foreach (var item in request.Items)
            {
                if (item.ProductId <= 0 || item.Quantity < 1 || item.Quantity > 100 ||
                    double.IsNaN(item.ExpectedWeight) || double.IsInfinity(item.ExpectedWeight) || item.ExpectedWeight < 0 || item.ExpectedWeight > 100 ||
                    (item.SelectedUnit?.Length ?? 0) > 20)
                    return BadRequest(new { error = "One or more cart items have invalid values" });
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
            StoreConfig? store = null;
            if (orderType == "Delivery")
            {
                store = await _context.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync();

                var suburb = (request.DeliverySuburb ?? "").Trim();
                if (string.IsNullOrEmpty(suburb))
                    return BadRequest(new { error = "Please select delivery suburb" });
                if (!StoreDeliveryHelper.IsAllowedSuburb(suburb, store?.DeliveryZoneFeesJson))
                {
                    var names = string.Join(", ", StoreDeliveryHelper.AllowedDeliverySuburbKeys.Select(StoreDeliveryHelper.DisplaySuburb));
                    return BadRequest(new { error = $"We only deliver to {names}" });
                }
            }

            // === 步骤 4: 创建订单对象 ===
            var order = new Order
            {
                UserId = user.Id,
                ClientRequestId = clientRequestId,
                OrderType = orderType,
                OrderStatus = "Pending", // 初始状态：待支付
                PickupTime = request.PickupTime.HasValue ? DateTime.SpecifyKind(request.PickupTime.Value, DateTimeKind.Utc) : null, // 转换为 UTC
                DeliveryAddress = orderType == "Delivery" ? request.DeliveryAddress?.Trim() : null,
                DeliverySuburb = orderType == "Delivery" ? (request.DeliverySuburb ?? "").Trim() : null,
                Items = new List<OrderItem>()
            };

            // === 步骤 5: 添加订单项 ===
            decimal totalAmount = 0;

            foreach (var item in request.Items)
            {
                var product = products.First(p => p.Id == item.ProductId);
                if (!TryResolveUnitPrice(product, item.SelectedUnit, out var selectedUnit, out var unitPrice))
                {
                    return BadRequest(new { error = $"Invalid unit for product: {product.Name}" });
                }

                // Only a server-validated catalog unit may choose the weighing path. Never let an
                // arbitrary client string change quantity semantics after falling back to another price.
                var isWeighed = string.Equals(selectedUnit, "kg", StringComparison.OrdinalIgnoreCase);

                decimal lineAmount;
                var orderItem = new OrderItem
                {
                    ProductId = product.Id,
                    ProductName = product.Name,
                    PriceAtPurchase = unitPrice,
                };

                if (isWeighed)
                {
                    var w = item.ExpectedWeight;
                    if (w <= 0 || double.IsNaN(w) || double.IsInfinity(w))
                    {
                        return BadRequest(new { error = $"Estimated weight (kg) is required for weighed item: {product.Name}" });
                    }

                    orderItem.Quantity = 1;
                    orderItem.ExpectedWeight = w;
                    lineAmount = Math.Round(unitPrice * (decimal)w, 2, MidpointRounding.AwayFromZero);
                }
                else
                {
                    if (item.ExpectedWeight > 0)
                    {
                        return BadRequest(new { error = $"Weight is only valid for kg items: {product.Name}" });
                    }

                    orderItem.Quantity = item.Quantity;
                    orderItem.ExpectedWeight = 0;
                    lineAmount = Math.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
                }

                order.Items.Add(orderItem);
                totalAmount += lineAmount;
            }

            // 配送订单：分区运费（StoreConfigs.DeliveryZoneFeesJson，空则每区默认 $10），满 FreeDeliveryThreshold 包邮
            if (orderType == "Delivery")
            {
                store = await _context.StoreConfigs.AsNoTracking().OrderBy(s => s.Id).FirstOrDefaultAsync();
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

            if (totalAmount <= 0 || totalAmount > 100000m)
                return BadRequest(new { error = "Order total is outside the allowed range" });
            order.TotalAmount = Math.Round(totalAmount, 2, MidpointRounding.AwayFromZero);

            // === 步骤 6: 取件码（6 位数字，支付成功后邮件通知） ===
            order.PickupCode = GeneratePickupCode();

            // === 步骤 7: 保存到数据库 ===
            _context.Orders.Add(order);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // A concurrent retry may win the unique (UserId, ClientRequestId) insert.
                // Return that order instead of surfacing a conflict or creating another order.
                _context.ChangeTracker.Clear();
                existingOrder = await _context.Orders.AsNoTracking()
                    .FirstOrDefaultAsync(o => o.UserId == currentUserId && o.ClientRequestId == clientRequestId);
                if (existingOrder == null) throw;
                return Ok(new
                {
                    message = "Order already created",
                    orderId = existingOrder.Id,
                    totalAmount = existingOrder.TotalAmount,
                    idempotentReplay = true,
                });
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

            if (!CanAccessOrder(order.UserId)) return Forbid();

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
            if (!CanAccessOrder(userId)) return Forbid();
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
        // 4. 顾客申请退款（可选部分商品；已完成订单须填理由）
        // POST: api/order/{orderId}/refund-request
        // ==========================================
        [HttpPost("{orderId}/refund-request")]
        public async Task<ActionResult<OrderDetailDto>> RequestRefund(
            int orderId,
            [FromBody] RefundRequestDto? body)
        {
            if (!TryGetCurrentUserId(out var userId)) return Unauthorized();

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

            var items = order.Items?.Where(oi => oi.CustomerRefundCompletedAt == null).ToList() ?? new List<OrderItem>();
            if (items.Count == 0)
            {
                return BadRequest(new { error = "No refundable items remain on this order." });
            }

            var reason = (body?.Reason ?? "").Trim();
            if (reason.Length > 1000) return BadRequest(new { error = "Refund reason is too long." });
            var requestedIds = (body?.ItemIds ?? new List<int>()).Where(id => id > 0).Distinct().ToList();

            List<int> selectedIds;
            if (items.Count == 1)
            {
                selectedIds = new List<int> { items[0].Id };
                if (requestedIds.Count > 0 && (requestedIds.Count != 1 || requestedIds[0] != selectedIds[0]))
                {
                    return BadRequest(new { error = "Invalid item selection for this order." });
                }
            }
            else
            {
                if (requestedIds.Count == 0)
                {
                    return BadRequest(new { error = "Please select at least one item to refund." });
                }

                var allowed = items.Select(i => i.Id).ToHashSet();
                if (requestedIds.Any(id => !allowed.Contains(id)))
                {
                    return BadRequest(new { error = "One or more selected items are invalid or already refunded." });
                }

                selectedIds = requestedIds;
            }

            if (string.Equals(order.OrderStatus, "Completed", StringComparison.OrdinalIgnoreCase))
            {
                if (reason.Length < 5)
                {
                    return BadRequest(new { error = "Please enter a refund reason (at least 5 characters)." });
                }
            }

            var selectedLines = items.Where(i => selectedIds.Contains(i.Id)).ToList();
            var sum = selectedLines.Sum(LineChargeForRefund);
            if (sum <= 0)
            {
                return BadRequest(new { error = "Selected items have no refundable amount." });
            }

            order.RefundRequestPreviousStatus = order.OrderStatus;
            order.RefundRejectionReason = null;
            order.RefundRequestReason = string.IsNullOrEmpty(reason) ? null : reason;
            order.RefundRequestedItemIdsJson = System.Text.Json.JsonSerializer.Serialize(selectedIds);
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
        /// 管理员更新履约状态。Paid 只能由已验证的 Stripe 回调/同步产生。
        /// </summary>
        [HttpPut("{orderId}/status")]
        [Authorize(Roles = "Admin")]
        public async Task<ActionResult<OrderDetailDto>> UpdateOrderStatus(
            int orderId,
            [FromBody] UpdateOrderStatusRequest? request)
        {
            var newStatus = request?.NewStatus?.Trim();
            if (string.IsNullOrWhiteSpace(newStatus))
                return BadRequest(new { error = "NewStatus is required" });

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
                // An unpaid order may be cancelled. Paid/refund states must use their dedicated
                // Stripe-backed flows so money and local status can never diverge.
                { "Pending", new List<string> { "Cancelled" } },
                { "Paid", new List<string> { "Preparing" } },
                { "Preparing", new List<string> { "Prepared" } },
                { "Prepared", new List<string> { "Completed" } },
                { "RefundRequested", new List<string>() },
                { "Refunded", new List<string>() },
                { "Completed", new List<string>() },
                { "Cancelled", new List<string>() }
            };

            var currentStatus = order.OrderStatus ?? string.Empty;
            if (!validStatusTransitions.TryGetValue(currentStatus, out var allowedNextStatuses) ||
                !allowedNextStatuses.Contains(newStatus))
            {
                return BadRequest($"Cannot transition from {currentStatus} to {newStatus}");
            }

            // 更新订单状态
            order.OrderStatus = newStatus;
            var completedNow = string.Equals(newStatus, "Completed", StringComparison.OrdinalIgnoreCase);
            if (completedNow)
                order.PickedUpAt ??= DateTime.UtcNow;
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();
            if (completedNow)
                await TrySendCompletionReceiptNowAsync(order.Id, HttpContext.RequestAborted);

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
        [Authorize(Roles = "Admin,Staff")]
        [EnableRateLimiting("sensitive")]
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

            // 更新订单状态为已完成，并记录交接时间，后续发票邮件只依赖这个完成标记发送。
            order.OrderStatus = "Completed";
            order.PickedUpAt ??= DateTime.UtcNow;
            _context.Orders.Update(order);
            await _context.SaveChangesAsync();
            await TrySendCompletionReceiptNowAsync(order.Id, HttpContext.RequestAborted);

            var dto = MapToOrderDetailDto(order);
            return Ok(new { message = "Order verified", order = dto });
        }

        private async Task TrySendCompletionReceiptNowAsync(int orderId, CancellationToken cancellationToken)
        {
            try
            {
                await _completionReceiptSender.TrySendForOrderAsync(orderId, TimeSpan.Zero, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[CompletionReceipt] Immediate receipt send failed for order {OrderId}", orderId);
            }
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
        [Authorize(Roles = "Admin,Staff")]
        [EnableRateLimiting("sensitive")]
        public async Task<ActionResult<OrderItemDetailDto>> UpdateItemWeight(
            int itemId,
            [FromBody] WeightUpdateDto request)
        {
            if (request == null || request.ActualWeight < 0 || request.ActualWeight > 100 ||
                double.IsNaN(request.ActualWeight) || double.IsInfinity(request.ActualWeight))
                return BadRequest(new { error = "Actual weight must be between 0 and 100 kg" });
            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, HttpContext.RequestAborted);

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
            if (orderItem.ExpectedWeight <= 0)
            {
                return BadRequest($"Product {orderItem.Product.Name} does not require weighing");
            }

            var order = orderItem.Order;
            var previousActual = orderItem.ActualWeight;

            if (!string.Equals(order.OrderStatus, "Preparing", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { error = "Actual weight can only be entered while the order is in Preparing status." });
            }

            if (previousActual.HasValue)
            {
                return BadRequest(new { error = "Actual weight for this line has already been saved and cannot be changed again." });
            }

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

            decimal newLineRefund = Math.Round(LineRefundForWeight(expectedTotalWeight, newActualTotalWeight, refundPerKg), 2, MidpointRounding.AwayFromZero);
            decimal oldLineRefund = previousActual.HasValue
                ? Math.Round(LineRefundForWeight(expectedTotalWeight, oldActualTotalWeight, refundPerKg), 2, MidpointRounding.AwayFromZero)
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
            await transaction.CommitAsync(HttpContext.RequestAborted);

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
                RefundRequestReason = order.RefundRequestReason,
                RefundRequestedItemIds = ParseRefundItemIdList(order.RefundRequestedItemIdsJson),
                OrderStatus = order.OrderStatus,
                OrderType = order.OrderType,
                StripeSessionId = IsPrivileged() ? order.StripeSessionId : null,
                StripePaymentIntentId = IsPrivileged() ? order.StripePaymentIntentId : null,
                PickupCode = order.PickupCode,
                PickupTime = order.PickupTime,
                DeliveryAddress = order.DeliveryAddress,
                DeliverySuburb = order.DeliverySuburb,
                DeliveryDistanceKm = order.DeliveryDistanceKm,
                PickedUpAt = order.PickedUpAt,
                Items = order.Items?.Select(oi => MapToOrderItemDetailDto(oi)).ToList(),
                CreatedAt = order.CreatedAt
            };
        }

        private static string GeneratePickupCode() =>
            RandomNumberGenerator.GetInt32(100000, 1000000).ToString("D6");

        private bool TryGetCurrentUserId(out int userId) =>
            int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

        private bool IsPrivileged() => User.IsInRole("Admin") || User.IsInRole("Staff");

        private bool CanAccessOrder(int ownerUserId) =>
            IsPrivileged() || (TryGetCurrentUserId(out var currentUserId) && currentUserId == ownerUserId);

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
                IsWeighingRequired = item.ExpectedWeight > 0,
                CustomerRefundCompletedAt = item.CustomerRefundCompletedAt,
            };
        }

        private static List<int>? ParseRefundItemIdList(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return null;
            try
            {
                return System.Text.Json.JsonSerializer.Deserialize<List<int>>(json);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>该行顾客实付金额（与下单/称重逻辑一致）。</summary>
        private static decimal LineChargeForRefund(OrderItem oi)
        {
            if (oi.ExpectedWeight > 0)
            {
                var kg = (decimal)(oi.ActualWeight ?? oi.ExpectedWeight);
                if (kg < 0) kg = 0;
                return oi.PriceAtPurchase * kg;
            }

            return oi.PriceAtPurchase * oi.Quantity;
        }

        private static bool TryResolveUnitPrice(
            Product product,
            string? requestedUnit,
            out string selectedUnit,
            out decimal unitPrice)
        {
            var options = ParseUnitPriceOptions(product.UnitPriceOptionsJson);
            if (options.Count == 0)
            {
                options.Add(new ProductUnitPriceOption
                {
                    Unit = string.IsNullOrWhiteSpace(product.Unit) ? "ea" : product.Unit.Trim(),
                    Price = Math.Round(product.Price, 2, MidpointRounding.AwayFromZero),
                });
            }

            var requested = string.IsNullOrWhiteSpace(requestedUnit)
                ? options[0].Unit
                : requestedUnit.Trim();
            var match = options.FirstOrDefault(x =>
                string.Equals(x.Unit, requested, StringComparison.OrdinalIgnoreCase));
            if (match is null || match.Price <= 0)
            {
                selectedUnit = string.Empty;
                unitPrice = 0;
                return false;
            }

            selectedUnit = match.Unit;
            unitPrice = match.Price;
            return true;
        }

        private static List<ProductUnitPriceOption> ParseUnitPriceOptions(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new();
            try
            {
                var list = JsonSerializer.Deserialize<List<ProductUnitPriceOption>>(json);
                if (list == null) return new();
                return list
                    .Where(x => !string.IsNullOrWhiteSpace(x.Unit) && x.Price > 0)
                    .Select(x => new ProductUnitPriceOption
                    {
                        Unit = x.Unit.Trim(),
                        Price = Math.Round(x.Price, 2, MidpointRounding.AwayFromZero),
                    })
                    .ToList();
            }
            catch
            {
                return new();
            }
        }

        private sealed class ProductUnitPriceOption
        {
            public string Unit { get; set; } = string.Empty;
            public decimal Price { get; set; }
        }
    }

    // ==========================================
    // 请求 DTO
    // ==========================================
    public class UpdateOrderStatusRequest
    {
        public string? NewStatus { get; set; }
    }
}
