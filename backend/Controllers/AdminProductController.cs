using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;
using IGA.Services;
using igaServer.Data;
using igaServer.Utils;
using igaServer.Models;

namespace igaServer.Controllers
{
    /// <summary>
    /// 后台管理 API：仪表盘、订单、用户、商品
    /// </summary>
    [Route("api/admin")]
    [ApiController]
    public class AdminProductController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IWebHostEnvironment _env;
        private readonly IConfiguration _configuration;
        private readonly IStripeService _stripeService;
        private readonly IResendEmailService _resendEmail;
        private readonly ILogger<AdminProductController> _logger;

        public AdminProductController(
            ApplicationDbContext context,
            IWebHostEnvironment env,
            IConfiguration configuration,
            IStripeService stripeService,
            IResendEmailService resendEmail,
            ILogger<AdminProductController> logger)
        {
            _context = context;
            _env = env;
            _configuration = configuration;
            _stripeService = stripeService;
            _resendEmail = resendEmail;
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
                .Include(o => o.User)
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
                    if (!paid) continue;

                    order.OrderStatus = "Paid";
                    if (!string.IsNullOrEmpty(session.PaymentIntentId))
                    {
                        order.StripePaymentIntentId = session.PaymentIntentId;
                    }
                    paidNotifications.Add((order.Id, session.CustomerDetails?.Email ?? session.CustomerEmail));
                    updated++;
                }
                catch (StripeException ex)
                {
                    _ = ex;
                }
            }

            if (updated > 0)
            {
                await _context.SaveChangesAsync();
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
                Cancelled = dict.GetValueOrDefault("Cancelled", 0)
            });
        }

        [HttpGet("orders")]
        public async Task<IActionResult> GetOrders(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? status = null,
            [FromQuery] string? orderType = null,
            [FromQuery] bool? pickedUp = null)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            if (string.IsNullOrEmpty(status) || status == "Pending" || status == "Paid")
            {
                await SyncRecentlyPaidPendingOrdersAsync();
            }
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            IQueryable<Order> query = _context.Orders.Include(o => o.User);
            if (!string.IsNullOrEmpty(status))
                query = query.Where(o => o.OrderStatus == status);
            if (!string.IsNullOrEmpty(orderType))
                query = query.Where(o => o.OrderType == orderType);
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
                    userPhone = o.User != null ? o.User.PhoneNumber : "",
                    totalAmount = o.TotalAmount,
                    finalAmount = o.FinalAmount,
                    orderStatus = o.OrderStatus,
                    orderType = o.OrderType,
                    pickupTime = o.PickupTime,
                    deliveryAddress = o.DeliveryAddress,
                    stripeSessionId = o.StripeSessionId,
                    stripePaymentIntentId = o.StripePaymentIntentId,
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
            await _context.SaveChangesAsync();
            return Ok(new { id = order.Id, orderStatus = "Prepared", message = "Moved to ready for pickup" });
        }

        /// <summary>
        /// 标记顾客已取货/已交接：仍为 Prepared；从 Ready 列表消失，出现在 Completed pickup/delivery 列表。
        /// </summary>
        [HttpPost("order-picked-up/{orderId}")]
        public Task<IActionResult> MarkOrderPickedUp(int orderId) => MarkOrderPickedUpCore(orderId);

        /// <summary>同上，REST 风格备用路径。</summary>
        [HttpPost("orders/{orderId}/picked-up")]
        public Task<IActionResult> MarkOrderPickedUpRest(int orderId) => MarkOrderPickedUpCore(orderId);

        /// <summary>旧版路径，兼容已部署客户端。</summary>
        [HttpPost("order-mark-picked-up/{orderId}")]
        public Task<IActionResult> MarkOrderPickedUpLegacy(int orderId) => MarkOrderPickedUpCore(orderId);

        [HttpPost("order-refund-approve/{orderId}")]
        public async Task<IActionResult> ApproveRefundRequest(int orderId)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders.FindAsync(orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "RefundRequested")
                return BadRequest("Can only approve RefundRequested orders");

            var refundableRemaining = Math.Max(0, order.TotalAmount - order.RefundAmount);
            if (refundableRemaining <= 0.01m)
            {
                order.FinalAmount = 0;
                order.OrderStatus = "Refunded";
                await _context.SaveChangesAsync();
                return Ok(new { id = order.Id, orderStatus = order.OrderStatus, refundAmount = order.RefundAmount, message = "Order already fully refunded" });
            }

            if (string.IsNullOrWhiteSpace(order.StripePaymentIntentId))
            {
                return BadRequest(new { error = "Order is missing StripePaymentIntentId; cannot refund through Stripe." });
            }

            var minorUnits = (long)Math.Round(refundableRemaining * 100m, MidpointRounding.AwayFromZero);
            if (minorUnits < 1)
            {
                return BadRequest(new { error = "Refund amount is too small for Stripe." });
            }

            var idempotencyKey = $"customer-refund-order-{order.Id}-{minorUnits}-{order.RefundAmount:0.00}";
            var (ok, errMsg, refundId) = await _stripeService.CreatePartialRefundAsync(
                order.StripePaymentIntentId,
                minorUnits,
                idempotencyKey,
                HttpContext.RequestAborted);

            if (!ok)
            {
                return StatusCode(502, new { error = "Stripe refund failed", detail = errMsg });
            }

            order.RefundAmount += refundableRemaining;
            order.FinalAmount = 0;
            order.OrderStatus = "Refunded";
            order.RefundRequestPreviousStatus = null;
            await _context.SaveChangesAsync();

            await TrySendRefundApprovedEmailAsync(order, refundableRemaining, HttpContext.RequestAborted);

            return Ok(new
            {
                id = order.Id,
                orderStatus = order.OrderStatus,
                refundAmount = order.RefundAmount,
                finalAmount = order.FinalAmount,
                stripeRefundId = refundId,
                message = "Refund approved and processed through Stripe"
            });
        }

        [HttpPost("order-refund-reject/{orderId}")]
        public async Task<IActionResult> RejectRefundRequest(int orderId, [FromBody] RejectRefundRequestDto? request)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var reason = request?.Reason?.Trim();
            if (string.IsNullOrWhiteSpace(reason))
                return BadRequest(new { error = "Rejection reason is required." });

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

        private async Task<IActionResult> MarkOrderPickedUpCore(int orderId)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var order = await _context.Orders.FindAsync(orderId);
            if (order == null) return NotFound("Order not found");
            if (order.OrderStatus != "Prepared")
                return BadRequest("Can only mark Prepared orders as picked up");
            if (order.PickedUpAt.HasValue)
                return BadRequest("Already marked as picked up");
            order.PickedUpAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return Ok(new { id = order.Id, orderStatus = order.OrderStatus, pickedUpAt = order.PickedUpAt, message = "Marked as picked up" });
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
            var users = await query
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
            return Ok(new { items = users, total, page, pageSize });
        }

        [HttpGet("users/{userId}")]
        public async Task<IActionResult> GetUser(int userId)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return NotFound();
            var name = user.Email == "guest@iga.local" ? "Guest" : user.Name;
            var email = user.Email == "guest@iga.local" ? "(Guest order)" : user.Email;
            return Ok(new { id = user.Id, name = name, email = email, phoneNumber = user.PhoneNumber, role = user.Role, createdAt = user.CreatedAt });
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

        /// <summary>上传商品图片（保存到 wwwroot/uploads/products，返回相对路径 URL）</summary>
        [HttpPost("products/upload-image")]
        [RequestSizeLimit(5 * 1024 * 1024)]
        public async Task<IActionResult> UploadProductImage(IFormFile? file)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded" });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            var allowed = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
            if (!allowed.Contains(ext))
                return BadRequest(new { error = "Only JPG, PNG, GIF or WebP images are allowed" });

            if (file.Length > 5 * 1024 * 1024)
                return BadRequest(new { error = "File size must not exceed 5MB" });

            var webRoot = _env.WebRootPath;
            if (string.IsNullOrEmpty(webRoot))
                return StatusCode(500, new { error = "Web root path is not configured" });

            var uploadDir = Path.Combine(webRoot, "uploads", "products");
            Directory.CreateDirectory(uploadDir);

            var fileName = $"{Guid.NewGuid():N}{ext}";
            var savePath = Path.Combine(uploadDir, fileName);
            await using (var stream = System.IO.File.Create(savePath))
            {
                await file.CopyToAsync(stream);
            }

            var url = $"/uploads/products/{fileName}";
            return Ok(new { url });
        }
    }
}
