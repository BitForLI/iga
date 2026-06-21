using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using igaServer.Data;
using igaServer.Utils;
using igaServer.Models;
using System.Text.Json;

namespace igaServer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ProductController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public ProductController(ApplicationDbContext context)
        {
            _context = context;
        }

        private async Task<IActionResult?> RequireAdminAsync()
        {
            var (ok, role) = await BackofficeAuthHelper.GetUserRoleAsync(Request, _context);
            if (!ok) return Unauthorized(new { error = "Sign in required" });
            if (!BackofficeAuthHelper.IsAdmin(role)) return StatusCode(403, new { error = "Admin only" });
            return null;
        }

        // ==========================================
        // 🛒 顾客端功能 (Customer Features)
        // ==========================================

        // 1. 获取商品列表 (支持搜索 & 分类筛选)
        // 对应功能：搜索与分类
        // GET: api/product?category=Meat&search=beef
        [HttpGet]
        public async Task<IActionResult> GetProducts(
            [FromQuery] string? category, 
            [FromQuery] string? search)
        {
            // 默认只查询“已上架”的商品 (IsActive == true)
            var query = _context.Products.AsQueryable();

            // 如果是顾客查询（通常前台只调这个接口），我们可以默认过滤掉下架商品
            // 但为了后台也能用这个接口，这里暂时不强制过滤 IsActive，交给前端参数控制
            // 或者我们可以约定：前台传 isActive=true

            // 1. 按分类筛选 (例如：Veggie, Meat, Fruit)
            if (!string.IsNullOrEmpty(category))
            {
                query = query.Where(p => p.Category == category);
            }

            // 2. 关键词搜索 (模糊匹配名称或描述)
            if (!string.IsNullOrEmpty(search))
            {
                query = query.Where(p => p.Name.ToLower().Contains(search.ToLower()));
            }

            // 顾客端不暴露成本价，仅返回卖价等字段
            var items = await query
                .Select(p => new { p.Id, p.Name, p.ImageUrl, p.Category, p.Price, p.Unit, p.UnitPriceOptionsJson, p.IsActive, p.IsWeighingRequired, p.DefaultExpectedWeightKg })
                .ToListAsync();
            return Ok(items);
        }

        // 2. 获取单个商品详情（顾客端，不暴露成本价）
        // GET: api/product/5
        [HttpGet("{id}")]
        public async Task<IActionResult> GetProduct(int id)
        {
            var product = await _context.Products.FindAsync(id);

            if (product == null)
            {
                return NotFound();
            }

            return Ok(new { product.Id, product.Name, product.ImageUrl, product.Category, product.Price, product.Unit, product.UnitPriceOptionsJson, product.IsActive, product.IsWeighingRequired, product.DefaultExpectedWeightKg });
        }

        // 3. 读取数据库存储商品图片
        // GET: api/product/image/{id}
        [HttpGet("image/{id:guid}")]
        public async Task<IActionResult> GetProductImage(Guid id)
        {
            var image = await _context.ProductImages.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            if (image == null)
            {
                return NotFound();
            }

            return File(image.ImageBytes, image.ContentType);
        }

        // ==========================================
        // 🔧 商家端后台功能 (Merchant Backend)
        // ==========================================

        // 3. 创建新商品
        // POST: api/product
        [HttpPost]
        public async Task<IActionResult> CreateProduct(Product product)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            product.ImageUrl = product.ImageUrl?.Trim() ?? "";
            NormalizeUnitPrices(product);
            // 自动设置创建时间
            // product.CreatedAt = DateTime.Now; (如果在 Model 里没赋值的话)
            
            _context.Products.Add(product);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetProduct), new { id = product.Id }, product);
        }

        // 4. 修改商品信息 (改价、改名、改描述)
        // PUT: api/product/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateProduct(int id, Product product)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            if (id != product.Id)
            {
                return BadRequest();
            }
            product.ImageUrl = product.ImageUrl?.Trim() ?? "";
            NormalizeUnitPrices(product);

            _context.Entry(product).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!_context.Products.Any(e => e.Id == id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        private static void NormalizeUnitPrices(Product product)
        {
            var normalized = ParseUnitPriceOptions(product.UnitPriceOptionsJson);
            if (normalized.Count == 0)
            {
                var fallbackUnit = string.IsNullOrWhiteSpace(product.Unit) ? "ea" : product.Unit.Trim();
                var fallbackPrice = product.Price > 0 ? product.Price : 0.01m;
                normalized = new List<UnitPriceOption>
                {
                    new() { Unit = fallbackUnit, Price = Math.Round(fallbackPrice, 2, MidpointRounding.AwayFromZero) }
                };
            }

            product.UnitPriceOptionsJson = JsonSerializer.Serialize(normalized);
            product.Unit = normalized[0].Unit;
            product.Price = normalized[0].Price;
            product.IsWeighingRequired = normalized.Any(x => string.Equals(x.Unit, "kg", StringComparison.OrdinalIgnoreCase));

            if (!product.IsWeighingRequired)
            {
                product.DefaultExpectedWeightKg = 0;
            }
            else if (product.DefaultExpectedWeightKg <= 0)
            {
                product.DefaultExpectedWeightKg = 1;
            }
        }

        private static readonly JsonSerializerOptions _caseInsensitiveOpts =
            new() { PropertyNameCaseInsensitive = true };

        private static List<UnitPriceOption> ParseUnitPriceOptions(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new();
            try
            {
                var list = JsonSerializer.Deserialize<List<UnitPriceOption>>(json, _caseInsensitiveOpts) ?? new();
                return list
                    .Where(x => !string.IsNullOrWhiteSpace(x.Unit) && x.Price > 0)
                    .Select(x => new UnitPriceOption
                    {
                        Unit = x.Unit.Trim(),
                        Price = Math.Round(x.Price, 2, MidpointRounding.AwayFromZero),
                    })
                    .GroupBy(x => x.Unit, StringComparer.OrdinalIgnoreCase)
                    .Select(g => g.First())
                    .ToList();
            }
            catch
            {
                return new();
            }
        }

        private sealed class UnitPriceOption
        {
            public string Unit { get; set; } = string.Empty;
            public decimal Price { get; set; }
        }

        // 5. 一键上下架 (关键功能)
        // 对应功能：商家可以一键切换商品在线/离线状态
        // PATCH: api/product/5/toggle-status
        [HttpPatch("{id}/toggle-status")]
        public async Task<IActionResult> ToggleProductStatus(int id)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }

            // 取反当前状态 (上架变下架，下架变上架)
            product.IsActive = !product.IsActive;
            
            await _context.SaveChangesAsync();

            return Ok(new { id = product.Id, isActive = product.IsActive, message = "Status updated" });
        }

        // 6. 删除商品 (慎用，通常建议只下架)
        // DELETE: api/product/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteProduct(int id)
        {
            if (await RequireAdminAsync() is { } denied) return denied;
            var product = await _context.Products.FindAsync(id);
            if (product == null)
            {
                return NotFound();
            }

            _context.Products.Remove(product);
            await _context.SaveChangesAsync();

            return NoContent();
        }
    }
}