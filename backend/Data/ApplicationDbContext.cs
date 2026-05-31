using Microsoft.EntityFrameworkCore;
using igaServer.Models;

namespace igaServer.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Order> Orders { get; set; }
        public DbSet<OrderItem> OrderItems { get; set; }
        public DbSet<StoreConfig> StoreConfigs { get; set; } // 注册配置表
        public DbSet<StoreCarouselImage> StoreCarouselImages { get; set; }
        public DbSet<ProductImage> ProductImages { get; set; }
        public DbSet<StripeProcessedEvent> StripeProcessedEvents { get; set; }

        public DbSet<PendingRegistration> PendingRegistrations { get; set; }

        // 可选：在这里配置字段的特殊约束
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            
            // 确保用户名或邮箱唯一
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<Product>()
                .HasIndex(p => p.StripeProductId)
                .IsUnique();

            modelBuilder.Entity<StoreCarouselImage>(e =>
            {
                e.Property(x => x.ContentType).HasMaxLength(128);
                e.Property(x => x.ImageBytes);
            });

            modelBuilder.Entity<ProductImage>(e =>
            {
                e.Property(x => x.ContentType).HasMaxLength(128);
                e.Property(x => x.ImageBytes);
            });
        }
    }
}