using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Models;
using igaServer.DTOs;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class OrderController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public OrderController(ApplicationDbContext context)
        {
            _context = context;
        }

        // ==========================================
        // 1. 创建订单（购物车转订单）
        // POST: api/order/create
        // ==========================================
        [HttpPost("create")]
        public async Task<ActionResult<OrderDetailDto>> CreateOrder([FromBody] OrderCreateDto request)
        {
            // === 步骤 1: 验证用户存在（UserId 0 时使用 Guest） ===
            User user;
            if (request.UserId == 0)
            {
                user = await _context.Users.FirstOrDefaultAsync(u => u.Email == "guest@iga.local");
                if (user == null) return BadRequest(new { error = "Guest user not initialized, check database seed" });
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

            // === 步骤 3.5: 配送订单需校验区域并计算运费 ===
            var allowedSuburbs = new[] { "hurstville", "allawah", "carlton", "roseland" };
            if (request.OrderType == "Delivery")
            {
                var suburb = (request.DeliverySuburb ?? "").Trim();
                if (string.IsNullOrEmpty(suburb))
                    return BadRequest(new { error = "Please select delivery suburb" });
                if (!allowedSuburbs.Contains(suburb.ToLowerInvariant()))
                    return BadRequest(new { error = "We only deliver to Hurstville, Allawah, Carlton, Roseland" });
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

                // 创建订单项
                var orderItem = new OrderItem
                {
                    ProductId = product.Id,
                    ProductName = product.Name,
                    Quantity = item.Quantity,
                    PriceAtPurchase = product.Price,
                    ExpectedWeight = item.ExpectedWeight
                };

                order.Items.Add(orderItem);

                // 累加总金额
                totalAmount += product.Price * item.Quantity;
            }

            // 配送订单：按消费金额计算运费，50 以上免运费
            if (request.OrderType == "Delivery")
            {
                decimal deliveryFee = totalAmount >= 50 ? 0
                    : totalAmount >= 35 ? 3
                    : totalAmount >= 20 ? 5
                    : 8;
                totalAmount += deliveryFee;
            }

            order.TotalAmount = totalAmount;

            // === 步骤 6: 取件码（6 位数字，支付成功后邮件通知） ===
            order.PickupCode = GeneratePickupCode();

            // === 步骤 7: 保存到数据库 ===
            _context.Orders.Add(order);
            await _context.SaveChangesAsync();

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
        // 4. 更新订单状态（仅 Admin 可用）
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
        // 5. 核销订单（手机后四位验证）
        // POST: api/order/{orderId}/verify
        // ==========================================
        /// <summary>
        /// 验证订单取货
        /// 1. 检查订单状态是否为 Prepared（已备货）
        /// 2. 验证手机后四位是否匹配
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

            // 验证手机后四位
            if (order.PickupCode != request.PhoneLast4Digits)
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
        // 6. 更新订单项重量（称重退款逻辑）
        // PUT: api/order/item/{itemId}/weight
        // ==========================================
        /// <summary>
        /// 称重退款逻辑（第四阶段高级功能）
        /// 商家在核销时输入实际重量
        /// 1. 检查商品是否需要称重
        /// 2. 计算差价
        /// 3. 保存实际重量信息
        /// 4. 标记为需要退款（后续通过 Stripe 执行）
        /// 注意：实际退款需要集成 StripeService（第三阶段）
        /// </summary>
        [HttpPut("item/{itemId}/weight")]
        public async Task<ActionResult<OrderItemDetailDto>> UpdateItemWeight(
            int itemId,
            [FromBody] WeightUpdateDto request,
            [FromHeader(Name = "X-Admin-Id")] int adminId)
        {
            // 验证操作者是否为 Admin
            var admin = await _context.Users.FindAsync(adminId);
            if (admin == null || admin.Role != "Admin")
            {
                return Unauthorized("Only admin can perform this action");
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

            // 保存实际重量
            orderItem.ActualWeight = request.ActualWeight;
            _context.OrderItems.Update(orderItem);

            // 计算差价
            // 预估总重 = ExpectedWeight * Quantity
            decimal expectedTotalWeight = (decimal)(orderItem.ExpectedWeight * orderItem.Quantity);
            decimal actualTotalWeight = (decimal)(request.ActualWeight * orderItem.Quantity);
            decimal weightDifference = expectedTotalWeight - actualTotalWeight;

            if (weightDifference > 0)
            {
                // 实际重量少于预估，需要退款
                decimal refundPerKg = orderItem.PriceAtPurchase; // 假设单价 = 每kg价格
                decimal refundAmount = refundPerKg * weightDifference;

                // 更新订单的退款金额
                var order = orderItem.Order;
                order.RefundAmount += refundAmount;

                // 计算最终金额
                if (order.FinalAmount == null)
                {
                    order.FinalAmount = order.TotalAmount;
                }
                order.FinalAmount -= refundAmount;

                _context.Orders.Update(order);
            }

            await _context.SaveChangesAsync();

            var itemDto = MapToOrderItemDetailDto(orderItem);
            return Ok(new 
            { 
                message = "Weight updated, price adjusted",
                orderItem = itemDto,
                refundInfo = new 
                { 
                    expectedWeight = orderItem.ExpectedWeight * orderItem.Quantity,
                    actualWeight = request.ActualWeight * orderItem.Quantity,
                    needsRefund = expectedTotalWeight > actualTotalWeight
                }
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
                ActualWeight = item.ActualWeight
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
