using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

        public AdminProductController(ApplicationDbContext context, IWebHostEnvironment env)
        {
            _context = context;
            _env = env;
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
            const int lowStockThreshold = 10;
            var lowStockCount = await _context.Products
                .CountAsync(p => p.StockQuantity <= lowStockThreshold && p.IsActive);
            return Ok(new { todaySales, pendingOrderCount = pendingCount, lowStockAlertCount = lowStockCount });
        }

        [HttpGet("orders/counts")]
        public async Task<IActionResult> GetOrderCounts()
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            var counts = await _context.Orders
                .GroupBy(o => o.OrderStatus)
                .Select(g => new { status = g.Key ?? "", count = g.Count() })
                .ToListAsync();
            var total = await _context.Orders.CountAsync();
            var dict = counts.ToDictionary(x => string.IsNullOrEmpty(x.status) ? "" : x.status, x => x.count);
            var preparedPickup = await _context.Orders.CountAsync(o => o.OrderStatus == "Prepared" && o.OrderType == "Pickup");
            var preparedDelivery = await _context.Orders.CountAsync(o => o.OrderStatus == "Prepared" && o.OrderType == "Delivery");
            var totalPrepared = preparedPickup + preparedDelivery;
            return Ok(new
            {
                total,
                Paid = dict.GetValueOrDefault("Paid", 0),
                Preparing = dict.GetValueOrDefault("Preparing", 0),
                Prepared = dict.GetValueOrDefault("Prepared", 0),
                PreparedPickup = preparedPickup,
                PreparedDelivery = preparedDelivery,
                TotalPrepared = totalPrepared,
                Completed = dict.GetValueOrDefault("Completed", 0),
                Pending = dict.GetValueOrDefault("Pending", 0),
                Cancelled = dict.GetValueOrDefault("Cancelled", 0)
            });
        }

        [HttpGet("orders")]
        public async Task<IActionResult> GetOrders(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string? status = null,
            [FromQuery] string? orderType = null)
        {
            if (await RequireStaffOrAdminAsync() is { } denied) return denied;
            if (page < 1) page = 1;
            if (pageSize < 1 || pageSize > 100) pageSize = 10;
            IQueryable<Order> query = _context.Orders.Include(o => o.User);
            if (!string.IsNullOrEmpty(status))
                query = query.Where(o => o.OrderStatus == status);
            if (!string.IsNullOrEmpty(orderType))
                query = query.Where(o => o.OrderType == orderType);
            // Prepared：未标记已取货的在上，已取货置底；同组内按时间倒序
            if (status == "Prepared")
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
            var order = await _context.Orders.FindAsync(orderId);
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
        /// 标记顾客已取货/已交接：仍为 Prepared，列表内置底（与 order-ready 同风格路径）。
        /// </summary>
        [HttpPost("order-picked-up/{orderId}")]
        public Task<IActionResult> MarkOrderPickedUp(int orderId) => MarkOrderPickedUpCore(orderId);

        /// <summary>同上，REST 风格备用路径。</summary>
        [HttpPost("orders/{orderId}/picked-up")]
        public Task<IActionResult> MarkOrderPickedUpRest(int orderId) => MarkOrderPickedUpCore(orderId);

        /// <summary>旧版路径，兼容已部署客户端。</summary>
        [HttpPost("order-mark-picked-up/{orderId}")]
        public Task<IActionResult> MarkOrderPickedUpLegacy(int orderId) => MarkOrderPickedUpCore(orderId);

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
