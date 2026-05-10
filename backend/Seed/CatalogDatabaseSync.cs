using igaServer.Data;
using igaServer.Models;
using Microsoft.EntityFrameworkCore;

namespace igaServer.Seed;

/// <summary>蔬菜/水果清单与数据库同步（真实写入 Postgres，非前端 mock）。</summary>
public static class CatalogDatabaseSync
{
    public const string DefaultImageUrl = "/images/main.png";

    /// <summary>删除 Vegetables、Fruit 两类商品（及关联订单行）后，按清单全量插入。</summary>
    public static async Task ResyncAllCatalogsAsync(ApplicationDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(@"
DELETE FROM ""OrderItems"" WHERE ""ProductId"" IN (
  SELECT ""Id"" FROM ""Products"" WHERE ""Category"" IN ('Vegetables', 'Fruit')
);
DELETE FROM ""Products"" WHERE ""Category"" IN ('Vegetables', 'Fruit');
");

        const string veg = "Vegetables";
        const string fruit = "Fruit";

        foreach (var name in VegetableCatalogNames.Names)
        {
            db.Products.Add(CreateProduct(name, veg));
        }
        foreach (var name in FruitCatalogNames.Names)
        {
            db.Products.Add(CreateProduct(name, fruit));
        }
        await db.SaveChangesAsync();
    }

    public static async Task ResyncVegetablesOnlyAsync(ApplicationDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(@"
DELETE FROM ""OrderItems"" WHERE ""ProductId"" IN (SELECT ""Id"" FROM ""Products"" WHERE ""Category"" = 'Vegetables');
DELETE FROM ""Products"" WHERE ""Category"" = 'Vegetables';
");
        foreach (var name in VegetableCatalogNames.Names)
            db.Products.Add(CreateProduct(name, "Vegetables"));
        await db.SaveChangesAsync();
    }

    public static async Task ResyncFruitOnlyAsync(ApplicationDbContext db)
    {
        await db.Database.ExecuteSqlRawAsync(@"
DELETE FROM ""OrderItems"" WHERE ""ProductId"" IN (SELECT ""Id"" FROM ""Products"" WHERE ""Category"" = 'Fruit');
DELETE FROM ""Products"" WHERE ""Category"" = 'Fruit';
");
        foreach (var name in FruitCatalogNames.Names)
            db.Products.Add(CreateProduct(name, "Fruit"));
        await db.SaveChangesAsync();
    }

    /// <summary>仅插入当前库中该分类下尚不存在的名称（按「分类+名称」判断）。</summary>
    public static async Task<(int vegAdded, int fruitAdded)> SeedMissingCatalogProductsAsync(ApplicationDbContext db)
    {
        const string veg = "Vegetables";
        const string fruit = "Fruit";

        var vegNames = (await db.Products.AsNoTracking()
            .Where(p => p.Category == veg)
            .Select(p => p.Name)
            .ToListAsync())
            .ToHashSet(StringComparer.Ordinal);

        var fruitNames = (await db.Products.AsNoTracking()
            .Where(p => p.Category == fruit)
            .Select(p => p.Name)
            .ToListAsync())
            .ToHashSet(StringComparer.Ordinal);

        var vegAdded = 0;
        foreach (var name in VegetableCatalogNames.Names)
        {
            if (vegNames.Contains(name)) continue;
            db.Products.Add(CreateProduct(name, veg));
            vegNames.Add(name);
            vegAdded++;
        }
        if (vegAdded > 0)
            await db.SaveChangesAsync();

        var fruitAdded = 0;
        foreach (var name in FruitCatalogNames.Names)
        {
            if (fruitNames.Contains(name)) continue;
            db.Products.Add(CreateProduct(name, fruit));
            fruitNames.Add(name);
            fruitAdded++;
        }
        if (fruitAdded > 0)
            await db.SaveChangesAsync();

        return (vegAdded, fruitAdded);
    }

    private static Product CreateProduct(string name, string category) => new()
    {
        Name = name,
        Category = category,
        Price = 1.00m,
        CostPrice = 0m,
        Unit = "kg",
        StockQuantity = 999,
        IsActive = true,
        ImageUrl = DefaultImageUrl,
        IsWeighingRequired = false
    };
}
