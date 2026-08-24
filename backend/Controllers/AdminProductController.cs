using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.IO;
using System.Text.Json;
using Stripe;
using Stripe.Checkout;
using IGA.Services;
using igaServer.Data;
using igaServer.Utils;
using igaServer.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using System.Data;
using System.Security.Cryptography;

namespace igaServer.Controllers
{
    /// <summary>
    /// 后台管理 API：仪表盘、订单、用户、商品
    /// </summary>
    [Route("api/admin")]
    [ApiController]
    [Authorize(Roles = "Admin,Staff")]
    public class AdminProductController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly IStripeService _stripeService;
        private readonly IResendEmailService _resendEmail;
        private readonly IOrderCompletionReceiptSender _completionReceiptSender;
        private readonly ILogger<AdminProductController> _logger;

        public AdminProductController(
            ApplicationDbContext context,
            IConfiguration configuration,
            IStripeService stripeService,
            IResendEmailService resendEmail,
            IOrderCompletionReceiptSender completionReceiptSender,
            ILogger<AdminProductController> logger)
        {
            _context = context;
            _configuration = configuration;
            _stripeService = stripeService;
            _resendEmail = resendEmail;
            _completionReceiptSender = completionReceiptSender;
            _logger = logger;
        }

        private async Task<IActionResult?> RequireAdminAsync()
        {
            var (ok, role) = await BackofficeAuthHelper.GetUserRoleAsync(Request, _context);
            if (!ok) return Unauthorized(new { error = "Sign in required" });
            if (!BackofficeAuthHelper.IsAdmin(role)) return StatusCode(403, new { error = "Admin only" });
            return null;
        }

        private async Task<IActionResult?> RequireStaffOrAdminAsync()
        {
            var (ok, role) = await BackofficeAuthHelper.GetUserRoleAsync(Request, _context);
            if (!ok) return Unauthorized(new { error = "Sign in required" });
            if (!BackofficeAuthHelper.IsStaffOrAdmin(role)) return StatusCode(403, new { error = "Staff or Admin only" });
            return null;
        }

        private async Task<int> SyncRecentlyPaidPendingOrdersAsync()
        {
            var stripeSecret = (_configuration["Stripe:SecretKey"] ?? "").Trim();
            if (string.IsNullOrWhiteSpace(stripeSecret))
            {
                return 0;
            }

            var since = DateTime.UtcNow.AddDays(-2);
            var candidates = await _context.Orders
                .AsNoTracking()
                .Where(o => o.OrderStatus == "Pending" &&
                            o.StripeSessionId != null &&
                            o.StripeSessionId != "" &&
                            o.CreatedAt >= since)
                .OrderByDescending(o => o.CreatedAt)
                .Take(20)
                .ToListAsync();

            if (candidates.Count == 0) return 0;

            StripeConfiguration.ApiKey = stripeSecret;
            var sessionService = new SessionService();
            var updated = 0;
            var paidNotifications = new List<(int OrderId, string? ContactEmail)>();

            foreach (var order in candidates)
            {
                try
                {
                    var session = await sessionService.GetAsync(order.StripeSessionId);
                    var paid = string.Equals(session.PaymentStatus, "paid", StringComparison.OrdinalIgnoreCase);
                    var expectedCurrency = (_configuration["Stripe:CheckoutCurrency"] ?? "aud").Trim().ToLowerInvariant();
                    var expectedAmount = (long)Math.Round(order.TotalAmount * 100m, MidpointRounding.AwayFromZero);
                    if (!paid || !string.Equals(session.Id, order.StripeSessionId, StringComparison.Ordinal) ||
                        !string.Equals(session.ClientReferenceId, order.Id.ToString(), StringComparison.Ordinal) ||
                        !string.Equals(session.Mode, "payment", StringComparison.OrdinalIgnoreCase) ||
                        !string.Equals(session.Currency, expectedCurrency, StringComparison.OrdinalIgnoreCase) ||
                        session.AmountTotal != expectedAmount || string.IsNullOrWhiteSpace(session.PaymentIntentId))
                        continue;

                    var affectedRows = await _context.Orders
                        .Where(o => o.Id == order.Id && o.OrderStatus == "Pending")
                        .ExecuteUpdateAsync(setters => setters
                            .SetProperty(o => o.OrderStatus, "Paid")
                            .SetProperty(o => o.StripePaymentIntentId, session.PaymentIntentId));
                    if (affectedRows != 1)
                        continue;

                    paidNotifications.Add((order.Id, session.CustomerDetails?.Email ?? session.CustomerEmail));
                    updated++;
                }
                catch (StripeException ex)
                {
                    _ = ex;
                }
            }

            foreach (var (orderId, contactEmail) in paidNotifications)
            {
                await OrderPaidNotifier.TryNotifyPickupEmailAsync(
                    _context,
                    _resendEmail,
                    orderId,
                    _logger,
                    contactEmail,
                    _configuration["Store:PickupAddress"] ?? "IGA Beverly Hills");
            }

            return updated;
        }

        [HttpGet("dashboard")]
        public async Task<IActionResult> GetDashboard()
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var today = DateTime.UtcNow.Date;
            var tomorrow = today.AddDays(1);
            var todaySales = await _context.Orders
                .Where(o => o.CreatedAt >= today && o.CreatedAt < tomorrow &&
                    (o.OrderStatus == "Paid" || o.OrderStatus == "Preparing" || o.OrderStatus == "Prepared" || o.OrderStatus == "Completed"))
                .SumAsync(o => o.FinalAmount ?? o.TotalAmount);
            var pendingCount = await _context.Orders
                .CountAsync(o => o.OrderStatus == "Pending" || o.OrderStatus == "Paid" || o.OrderStatus == "Preparing" || o.OrderStatus == "Prepared");
            return Ok(new { todaySales, pendingOrderCount = pendingCount });
        }

        [HttpGet("orders/counts")]
        public async Task<IActionResult> GetOrderCounts()
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            await SyncRecentlyPaidPendingOrdersAsync();
            var counts = await _context.Orders
                .GroupBy(o => o.OrderStatus)
                .Select(g => new { status = g.Key ?? "", count = g.Count() })
                .ToListAsync();
            var total = await _context.Orders.CountAsync();
            var dict = counts.ToDictionary(x => string.IsNullOrEmpty(x.status) ? "" : x.status, x => x.count);
            var refundHistoryCount = await _context.Orders.CountAsync(o => o.RefundAmount > 0m || o.OrderStatus == "RefundRequested");
            // Ready：Prepared 且尚未标记取走/交接；Completed*：已标记（仍存为 Prepared + PickedUpAt）
            var preparedPickup = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Pickup" && !o.PickedUpAt.HasValue);
            var preparedDelivery = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Delivery" && !o.PickedUpAt.HasValue);
            var completedPickup = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Pickup" && o.PickedUpAt.HasValue);
            var completedDelivery = await _context.Orders.CountAsync(o =>
                o.OrderStatus == "Prepared" && o.OrderType == "Delivery" && o.PickedUpAt.HasValue);
            var totalPrepared = preparedPickup + preparedDelivery + completedPickup + completedDelivery;
            return Ok(new
            {
                total,
                Paid = dict.GetValueOrDefault("Paid", 0),
                Preparing = dict.GetValueOrDefault("Preparing", 0),
                Prepared = dict.GetValueOrDefault("Prepared", 0),
                PreparedPickup = preparedPickup,
                PreparedDelivery = preparedDelivery,
                CompletedPickup = completedPickup,
                CompletedDelivery = completedDelivery,
                TotalPrepared = totalPrepared,
                Completed = dict.GetValueOrDefault("Completed", 0),
                Pending = dict.GetValueOrDefault("Pending", 0),
                RefundRequested = dict.GetValueOrDefault("RefundRequested", 0),
                RefundHistory = refundHistoryCount,
                Cancelled = dict.GetValueOrDefault("Cancelled", 0)
            });
        }

        [HttpGet("orders")]
        public async Task<IActionResult> GetOrders(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? status = null,
            [FromQuery] string? orderType = null,
            [FromQuery] bool? pickedUp = null,
            [FromQuery] string? pickupCode = null,
            [FromQuery] string? deliverySuburb = null,
            [FromQuery] bool refundHistoryOnly = false)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var isAdmin = User.IsInRole("Admin");
            if (string.IsNullOrEmpty(status) || status == "Pending" || status == "Paid")
            {
                await SyncRecentlyPaidPendingOrdersAsync();
            }
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            IQueryable<Order> query = _context.Orders.Include(o => o.User);
            if (refundHistoryOnly)
            {
                query = query.Where(o => o.OrderStatus == "RefundRequested" || o.RefundAmount > 0m);
            }
            else if (!string.IsNullOrEmpty(status))
                query = query.Where(o => o.OrderStatus == status);
            if (!string.IsNullOrEmpty(orderType))
                query = query.Where(o => o.OrderType == orderType);

            var pickupDigits = string.IsNullOrWhiteSpace(pickupCode)
                ? null
                : new string(pickupCode.Where(char.IsDigit).ToArray());
            if (!string.IsNullOrEmpty(pickupDigits))
            {
                query = query.Where(o => o.PickupCode != null && o.PickupCode.Contains(pickupDigits));
            }

            if (!string.IsNullOrWhiteSpace(deliverySuburb))
            {
                var key = deliverySuburb.Trim().ToLowerInvariant();
                if (StoreDeliveryHelper.IsAllowedSuburb(key))
                {
                    query = query.Where(o =>
                        o.OrderType == "Delivery" &&
                        (
                            (o.DeliverySuburb != null && o.DeliverySuburb.Trim() != "" && o.DeliverySuburb.Trim().ToLower() == key) ||
                            ((o.DeliverySuburb == null || o.DeliverySuburb.Trim() == "") &&
                             o.DeliveryAddress != null &&
                             o.DeliveryAddress.ToLower().Contains(key))
                        ));
                }
            }

            // Prepared + 指定 Pickup/Delivery：默认只列「待取/待交接」；pickedUp=true 只列已完成（有 PickedUpAt）
            if (string.Equals(status, "Prepared", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(orderType))
            {
                if (pickedUp == true)
                    query = query.Where(o => o.PickedUpAt != null);
                else
                    query = query.Where(o => o.PickedUpAt == null);
                query = pickedUp == true
                    ? query.OrderByDescending(o => o.PickedUpAt)
                    : query.OrderByDescending(o => o.CreatedAt);
            }
            else if (string.Equals(status, "Prepared", StringComparison.OrdinalIgnoreCase))
            {
                query = query
                    .OrderBy(o => o.PickedUpAt.HasValue)
                    .ThenByDescending(o => o.PickedUpAt ?? o.CreatedAt);
            }
            else
            {
                query = query.OrderByDescending(o => o.CreatedAt);
            }
            var total = await query.CountAsync();
            var orders = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(o => new
                {
                    id = o.Id,
                    userId = o.UserId,
                    userName = o.User != null ? o.User.Name : "",
                    userPhone = isAdmin && o.User != null ? o.User.PhoneNumber : "",
                    totalAmount = o.TotalAmount,
                    finalAmount = o.FinalAmount,
                    orderStatus = o.OrderStatus,
                    orderType = o.OrderType,
                    pickupTime = o.PickupTime,
                    pickupCode = isAdmin ? o.PickupCode : null,
                    deliveryAddress = isAdmin ? o.DeliveryAddress : null,
                    deliverySuburb = o.DeliverySuburb,
                    stripeSessionId = isAdmin ? o.StripeSessionId : null,
                    stripePaymentIntentId = isAdmin ? o.StripePaymentIntentId : null,
                    pickedUpAt = o.PickedUpAt,
                    createdAt = o.CreatedAt
                })
                .ToListAsync();
            return Ok(new { items = orders, total, page, pageSize });
        }

        /// <summary>
        /// 接单：将待接单(Paid)订单变为备货中(Preparing)，停止播报
        /// </summary>
        [HttpPost("order-accept/{orderId}")]
        public async Task<IActionResult> AcceptOrder(int orderId)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders
                .Include(o => o.User)
                .FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "Paid")
                return BadRequest("Can only accept Paid orders");
            order.OrderStatus = "Preparing";
            AdminAuditLogHelper.Add(_context, User, "OrderAccepted", "Order", order.Id);
            await _context.SaveChangesAsync();
            return Ok(new { id = order.Id, orderStatus = "Preparing", message = "Order accepted, moved to preparing" });
        }

        /// <summary>
        /// 备货完成：将备货中(Preparing)订单变为待取货(Prepared)
        /// </summary>
        [HttpPost("order-ready/{orderId}")]
        public async Task<IActionResult> MarkOrderReady(int orderId)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders.FindAsync(orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "Preparing")
                return BadRequest("Can only mark Preparing orders as ready");
            order.OrderStatus = "Prepared";
            AdminAuditLogHelper.Add(_context, User, "OrderMarkedReady", "Order", order.Id);
            await _context.SaveChangesAsync();
            return Ok(new { id = order.Id, orderStatus = "Prepared", message = "Moved to ready for pickup" });
        }

        /// <summary>
        /// 标记顾客已取货/已交接：仍为 Prepared；从 Ready 列表消失，出现在 Completed pickup/delivery 列表。
        /// </summary>
        [HttpPost("order-picked-up/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public Task<IActionResult> MarkOrderPickedUp(int orderId, [FromBody] MarkOrderPickedUpDto? request) =>
            MarkOrderPickedUpCore(orderId, request);

        /// <summary>同上，REST 风格备用路径。</summary>
        [HttpPost("orders/{orderId}/picked-up")]
        [EnableRateLimiting("sensitive")]
        public Task<IActionResult> MarkOrderPickedUpRest(int orderId, [FromBody] MarkOrderPickedUpDto? request) =>
            MarkOrderPickedUpCore(orderId, request);

        /// <summary>旧版路径，兼容已部署客户端。</summary>
        [HttpPost("order-mark-picked-up/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public Task<IActionResult> MarkOrderPickedUpLegacy(int orderId, [FromBody] MarkOrderPickedUpDto? request) =>
            MarkOrderPickedUpCore(orderId, request);

        [HttpPost("order-refund-approve/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public async Task<IActionResult> ApproveRefundRequest(int orderId)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (!_configuration.GetValue("Operations:AcceptRefunds", true))
                return StatusCode(503, new { error = "Refund processing is temporarily paused." });
            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, HttpContext.RequestAborted);
            var order = await _context.Orders
                .Include(o => o.User)
                .Include(o => o.Items!)
                .ThenInclude(oi => oi.Product)
                .FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "RefundRequested")
                return BadRequest("Can only approve RefundRequested orders");

            var refundableRemaining = Math.Max(0, order.TotalAmount - order.RefundAmount);
            if (refundableRemaining <= 0.01m)
            {
                order.FinalAmount = 0;
                order.OrderStatus = "Refunded";
                order.RefundRequestPreviousStatus = null;
                order.RefundRequestReason = null;
                order.RefundRequestedItemIdsJson = null;
                await _context.SaveChangesAsync();
                await transaction.CommitAsync(HttpContext.RequestAborted);
                return Ok(new { id = order.Id, orderStatus = order.OrderStatus, refundAmount = order.RefundAmount, message = "Order already fully refunded" });
            }

            if (string.IsNullOrWhiteSpace(order.StripePaymentIntentId))
            {
                return BadRequest(new { error = "Order is missing StripePaymentIntentId; cannot refund through Stripe." });
            }

            List<int> requestedItemIds;
            if (string.IsNullOrWhiteSpace(order.RefundRequestedItemIdsJson))
            {
                requestedItemIds = order.Items!
                    .Where(i => i.CustomerRefundCompletedAt == null)
                    .Select(i => i.Id)
                    .ToList();
            }
            else
            {
                try
                {
                    requestedItemIds = JsonSerializer.Deserialize<List<int>>(order.RefundRequestedItemIdsJson!) ?? new List<int>();
                }
                catch
                {
                    return BadRequest(new { error = "Invalid refund request item list." });
                }
            }

            if (requestedItemIds.Count == 0)
            {
                return BadRequest(new { error = "No items in this refund request." });
            }

            var lineItems = order.Items!
                .Where(i => requestedItemIds.Contains(i.Id) && i.CustomerRefundCompletedAt == null)
                .ToList();
            if (lineItems.Count != requestedItemIds.Count)
            {
                return BadRequest(new { error = "Refund request refers to unknown or already processed items." });
            }

            var requestedSum = lineItems.Sum(LineChargeForRefund);
            if (requestedSum <= 0)
            {
                return BadRequest(new { error = "Refund amount for selected items is zero." });
            }

            var refundNow = Math.Round(Math.Min(requestedSum, refundableRemaining), 2, MidpointRounding.AwayFromZero);
            var minorUnits = (long)Math.Round(refundNow * 100m, MidpointRounding.AwayFromZero);
            if (minorUnits < 1)
            {
                return BadRequest(new { error = "Refund amount is too small for Stripe." });
            }

            var idempotencyKey = $"customer-refund-order-{order.Id}-{minorUnits}-{string.Join("-", requestedItemIds.OrderBy(x => x))}";
            var (ok, errMsg, refundId) = await _stripeService.CreatePartialRefundAsync(
                order.StripePaymentIntentId,
                minorUnits,
                idempotencyKey,
                HttpContext.RequestAborted);

            if (!ok)
            {
                return StatusCode(502, new { error = "Stripe refund failed", detail = errMsg });
            }

            order.RefundAmount += refundNow;
            order.FinalAmount = order.TotalAmount - order.RefundAmount;
            foreach (var li in lineItems)
            {
                li.CustomerRefundCompletedAt = DateTime.UtcNow;
            }

            var fullyRefunded = order.RefundAmount >= order.TotalAmount - 0.01m;
            if (fullyRefunded)
            {
                order.OrderStatus = "Refunded";
                order.FinalAmount = 0;
            }
            else
            {
                order.OrderStatus = string.IsNullOrWhiteSpace(order.RefundRequestPreviousStatus)
                    ? "Completed"
                    : order.RefundRequestPreviousStatus!;
            }

            order.RefundRequestPreviousStatus = null;
            order.RefundRequestReason = null;
            order.RefundRequestedItemIdsJson = null;
            AdminAuditLogHelper.Add(_context, User, "RefundApproved", "Order", order.Id, $"amount={refundNow:0.00}");
            await _context.SaveChangesAsync();
            await transaction.CommitAsync(HttpContext.RequestAborted);

            await TrySendRefundApprovedEmailAsync(order, refundNow, HttpContext.RequestAborted);

            return Ok(new
            {
                id = order.Id,
                orderStatus = order.OrderStatus,
                refundAmount = order.RefundAmount,
                finalAmount = order.FinalAmount,
                stripeRefundId = refundId,
                refundedThisApproval = refundNow,
                message = "Refund approved and processed through Stripe"
            });
        }

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

        [HttpPost("order-refund-reject/{orderId}")]
        [EnableRateLimiting("sensitive")]
        public async Task<IActionResult> RejectRefundRequest(int orderId, [FromBody] RejectRefundRequestDto? request)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var reason = request?.Reason?.Trim();
            if (string.IsNullOrWhiteSpace(reason))
                return BadRequest(new { error = "Rejection reason is required." });
            if (reason.Length > 1000)
                return BadRequest(new { error = "Rejection reason is too long." });

            var order = await _context.Orders
                .Include(o => o.User)
                .FirstOrDefaultAsync(o => o.Id == orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "RefundRequested")
                return BadRequest("Can only reject RefundRequested orders");

            order.OrderStatus = string.IsNullOrWhiteSpace(order.RefundRequestPreviousStatus)
                ? "Paid"
                : order.RefundRequestPreviousStatus;
            order.RefundRejectionReason = reason;
            order.RefundRequestPreviousStatus = null;
            order.RefundRequestReason = null;
            order.RefundRequestedItemIdsJson = null;
            AdminAuditLogHelper.Add(_context, User, "RefundRejected", "Order", order.Id);
            await _context.SaveChangesAsync();

            await TrySendRefundRejectedEmailAsync(order, reason, HttpContext.RequestAborted);

            return Ok(new
            {
                id = order.Id,
                orderStatus = order.OrderStatus,
                refundRejectionReason = order.RefundRejectionReason,
                message = "Refund request rejected"
            });
        }

        private async Task TrySendRefundApprovedEmailAsync(Order order, decimal amount, CancellationToken cancellationToken)
        {
            var email = order.User?.Email?.Trim();
            if (string.IsNullOrWhiteSpace(email) || email.EndsWith("@iga.local", StringComparison.OrdinalIgnoreCase))
                return;

            var ok = await _resendEmail.SendRefundApprovedAsync(
                email,
                order.User?.Name ?? "Customer",
                order.Id,
                amount,
                DateTime.UtcNow,
                cancellationToken);

            if (!ok)
                _logger.LogWarning("[Refund] Approved email failed for order {OrderId}", order.Id);
        }

        private async Task TrySendRefundRejectedEmailAsync(Order order, string reason, CancellationToken cancellationToken)
        {
            var email = order.User?.Email?.Trim();
            if (string.IsNullOrWhiteSpace(email) || email.EndsWith("@iga.local", StringComparison.OrdinalIgnoreCase))
                return;

            var ok = await _resendEmail.SendRefundRejectedAsync(
                email,
                order.User?.Name ?? "Customer",
                order.Id,
                reason,
                DateTime.UtcNow,
                cancellationToken);

            if (!ok)
                _logger.LogWarning("[Refund] Rejected email failed for order {OrderId}", order.Id);
        }

        private async Task<IActionResult> MarkOrderPickedUpCore(int orderId, MarkOrderPickedUpDto? request)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders.FindAsync(orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "Prepared")
                return BadRequest("Can only mark Prepared orders as picked up");
            if (order.PickedUpAt.HasValue)
                return BadRequest("Already marked as picked up");
            if (string.Equals(order.OrderType, "Pickup", StringComparison.OrdinalIgnoreCase))
            {
                var expected = order.PickupCode ?? string.Empty;
                var entered = new string((request?.PickupCode ?? string.Empty).Where(char.IsDigit).ToArray());
                if (expected.Length != 6 || entered.Length != 6 ||
                    !CryptographicOperations.FixedTimeEquals(
                        System.Text.Encoding.ASCII.GetBytes(expected),
                        System.Text.Encoding.ASCII.GetBytes(entered)))
                    return BadRequest(new { error = "Invalid pickup code." });
            }
            order.PickedUpAt = DateTime.UtcNow;
            AdminAuditLogHelper.Add(_context, User, "OrderHandedOff", "Order", order.Id);
            await _context.SaveChangesAsync();
            await TrySendCompletionReceiptNowAsync(order.Id, HttpContext.RequestAborted);
            return Ok(new { id = order.Id, orderStatus = order.OrderStatus, pickedUpAt = order.PickedUpAt, message = "Marked as picked up" });
        }

        public sealed class MarkOrderPickedUpDto
        {
            public string? PickupCode { get; set; }
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

        public sealed class RejectRefundRequestDto
        {
            public string? Reason { get; set; }
        }

        [HttpGet("users")]
        public async Task<IActionResult> GetUsers(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            // 仅显示有过订单的用户（含访客 Guest）
            var query = _context.Users
                .Where(u => _context.Orders.Any(o => o.UserId == u.Id))
                .OrderByDescending(u => u.CreatedAt);
            var total = await query.CountAsync();
            var userRows = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new {
                    id = u.Id,
                    name = u.Email == "guest@iga.local" ? "Guest" : (u.Name ?? ""),
                    email = u.Email == "guest@iga.local" ? "(Guest order)" : u.Email,
                    phoneNumber = u.PhoneNumber,
                    role = u.Role,
                    createdAt = u.CreatedAt
                })
                .ToListAsync();
            var users = userRows.Select(u => new
            {
                u.id,
                u.name,
                u.email,
                phoneNumber = MaskPhone(u.phoneNumber),
                u.role,
                u.createdAt,
            }).ToList();
            AdminAuditLogHelper.Add(_context, User, "CustomerListViewed", "User", "page", $"page={page};pageSize={pageSize}");
            await _context.SaveChangesAsync();
            return Ok(new { items = users, total, page, pageSize });
        }

        [HttpGet("audit-logs")]
        public async Task<IActionResult> GetAuditLogs(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 50;

            var query = _context.AdminAuditLogs
                .AsNoTracking()
                .OrderByDescending(x => x.CreatedAtUtc);
            var total = await query.CountAsync();
            var items = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new { items, total, page, pageSize });
        }

        [HttpGet("users/{userId}")]
        public async Task<IActionResult> GetUser(int userId)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return NotFound();
            AdminAuditLogHelper.Add(_context, User, "CustomerViewed", "User", user.Id);
            await _context.SaveChangesAsync();
            var name = user.Email == "guest@iga.local" ? "Guest" : user.Name;
            var email = user.Email == "guest@iga.local" ? "(Guest order)" : user.Email;
            return Ok(new { id = user.Id, name = name, email = email, phoneNumber = user.PhoneNumber, role = user.Role, createdAt = user.CreatedAt });
        }

        private static string MaskPhone(string? phone)
        {
            if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
            var digits = new string(phone.Where(char.IsDigit).ToArray());
            if (digits.Length <= 4) return "••••";
            return $"••••••{digits[^4..]}";
        }

        [HttpGet("products")]
        public async Task<IActionResult> GetProducts(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? search = null)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;

            // 从 Query 读取 category（避免部分环境下 [FromQuery] string? category 未绑定导致筛选失效）
            var categoryRaw = Request.Query["category"].FirstOrDefault();

            var query = _context.Products.AsQueryable();

            // 分类精确匹配（不区分大小写）；常见误写 Vegetable -> Vegetables、Fruits -> Fruit
            if (!string.IsNullOrWhiteSpace(categoryRaw))
            {
                var c = categoryRaw.Trim();
                if (string.Equals(c, "Vegetable", StringComparison.OrdinalIgnoreCase))
                    c = "Vegetables";
                if (string.Equals(c, "Fruits", StringComparison.OrdinalIgnoreCase))
                    c = "Fruit";
                query = query.Where(p => p.Category != null && EF.Functions.ILike(p.Category, c));
            }

            // ILIKE：英文大小写不敏感（PostgreSQL）
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(p => EF.Functions.ILike(p.Name, $"%{term}%"));
            }

            query = query.OrderBy(p => p.Name).ThenBy(p => p.Id);

            var total = await query.CountAsync();
            var items = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                items,
                total,
                page,
                pageSize
            });
        }

        /// <summary>后台编辑商品：拉取完整字段（含成本价）</summary>
        [HttpGet("products/{id:int}")]
        public async Task<IActionResult> GetProduct(int id)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var p = await _context.Products.FindAsync(id);
            if (p == null) return NotFound();
            return Ok(p);
        }

        /// <summary>上传商品图片（保存到数据库，返回可直接访问的 /api/product/image/{id}）</summary>
        [HttpPost("products/upload-image")]
        [RequestSizeLimit(5 * 1024 * 1024)]
        [EnableRateLimiting("sensitive")]
        public async Task<IActionResult> UploadProductImage(IFormFile? file)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var (image, error) = await ImageUploadValidator.ValidateAsync(file, 5 * 1024 * 1024, HttpContext.RequestAborted);
            if (image == null) return BadRequest(new { error });
            var id = Guid.NewGuid();
            _context.ProductImages.Add(new ProductImage
            {
                Id = id,
                ImageBytes = image.Bytes,
                ContentType = image.ContentType,
                CreatedAtUtc = DateTime.UtcNow,
            });
            await _context.SaveChangesAsync();

            var url = $"/api/product/image/{id:D}";
            return Ok(new { url });
        }

    }
}
