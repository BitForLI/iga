using igaServer.Data;
using igaServer.Seed;
using Microsoft.EntityFrameworkCore;
using Npgsql;

static string[] GetCorsAllowedOrigins(IConfiguration config)
{
    var fromSection = config.GetSection("Cors:AllowedOrigins").Get<string[]>();
    if (fromSection is { Length: > 0 })
        return fromSection;
    var raw = config["Cors:AllowedOrigins"];
    if (!string.IsNullOrWhiteSpace(raw))
        return raw.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    return Array.Empty<string>();
}

var builder = WebApplication.CreateBuilder(args);

// Stripe：兼容 Railway 等平台常用的扁平环境变量名（与 Stripe__SecretKey 等效；仅在嵌套键为空时回填）
static void MapStripeFlatEnvIfNeeded(ConfigurationManager cfg)
{
    void Map(string nestedKey, string flatEnvName)
    {
        if (!string.IsNullOrWhiteSpace(cfg[nestedKey])) return;
        var v = Environment.GetEnvironmentVariable(flatEnvName);
        if (!string.IsNullOrWhiteSpace(v)) cfg[nestedKey] = v.Trim();
    }
    Map("Stripe:SecretKey", "STRIPE_SECRET_KEY");
    Map("Stripe:WebhookSecret", "STRIPE_WEBHOOK_SECRET");
    Map("Stripe:PublishableKey", "STRIPE_PUBLISHABLE_KEY");
}
MapStripeFlatEnvIfNeeded(builder.Configuration);

// Railway Postgres 常注入 DATABASE_URL；优先使用 ConnectionStrings__DefaultConnection，其次解析 DATABASE_URL
static string? ConnectionStringFromDatabaseUrl(string? databaseUrl)
{
    if (string.IsNullOrWhiteSpace(databaseUrl)) return null;
    try
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':', 2);
        var username = Uri.UnescapeDataString(userInfo[0]);
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
        var db = uri.AbsolutePath.Trim('/');
        if (string.IsNullOrEmpty(db)) return null;
        var port = uri.Port > 0 ? uri.Port : 5432;
        return new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = port,
            Database = db,
            Username = username,
            Password = password,
            SslMode = SslMode.Require,
            TrustServerCertificate = true,
        }.ConnectionString;
    }
    catch
    {
        return null;
    }
}

// 1. 连接串：appsettings.json → appsettings.{Environment}.json → 环境变量（如 ConnectionStrings__DefaultConnection）覆盖
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
    connectionString = ConnectionStringFromDatabaseUrl(Environment.GetEnvironmentVariable("DATABASE_URL"));

if (string.IsNullOrWhiteSpace(connectionString) && builder.Environment.IsDevelopment())
{
    Console.WriteLine(
        "[配置] Development 下数据库连接串为空：请填写 appsettings.Development.json、环境变量 ConnectionStrings__DefaultConnection，或 Railway 的 DATABASE_URL。");
}

if (string.IsNullOrWhiteSpace(connectionString) && !builder.Environment.IsDevelopment())
{
    throw new InvalidOperationException(
        "生产环境缺少数据库连接：请设置 ConnectionStrings__DefaultConnection，或确保注入 DATABASE_URL（Railway Postgres 插件通常会提供）。");
}

// 2. 注册 Postgres 数据库上下文
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

// 2b. CORS：Development 固定含 localhost；Production 必须在 Cors:AllowedOrigins 配置前端 HTTPS 源（或环境变量 Cors__AllowedOrigins__0）
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // localhost 与 127.0.0.1 在浏览器里属于不同 Origin，需同时允许（否则 Vite 用 127.0.0.1 打开时 API 会 CORS 失败 → axios 报 Network Error）
            var dev = new[]
            {
                "http://localhost:5173", "http://localhost:5174", "http://localhost:5175",
                "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175",
            };
            var extra = GetCorsAllowedOrigins(builder.Configuration);
            policy.WithOrigins(extra.Length > 0 ? dev.Concat(extra).Distinct().ToArray() : dev);
        }
        else
        {
            var origins = GetCorsAllowedOrigins(builder.Configuration);
            if (origins.Length == 0)
            {
                throw new InvalidOperationException(
                    "生产环境必须配置 Cors:AllowedOrigins（JSON 数组或分号分隔），例如 [\"https://你的前端域名\"]，或环境变量 Cors__AllowedOrigins__0。");
            }

            // 生产 API 仍允许本地 Vite 调试（与常见 Spring 示例一致；线上前端域名须仍在 Cors 中配置）
            var localDev = new[]
            {
                "http://localhost:5173", "http://localhost:5174", "http://localhost:5175",
                "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175",
            };
            policy.WithOrigins(origins.Concat(localDev).Distinct().ToArray());
        }

        policy.AllowAnyHeader().AllowAnyMethod();
    });
});

// 3. 注册控制器服务 (让 Controller 文件夹生效)
// JSON：反序列化时属性名不区分大小写，避免前端/Postman 用 PascalCase（Name）而后端默认期望 camelCase（name）导致字段全空 → 400
builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
});

// 4. 配置 Swagger 文档 (用于调试接口)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Stripe：启动时设置全局 ApiKey（与 PaymentController 创建 Checkout 前再次设置二选一即可，此处便于其它代码路径）
var stripeSecret = builder.Configuration["Stripe:SecretKey"];
if (!string.IsNullOrEmpty(stripeSecret))
{
    Stripe.StripeConfiguration.ApiKey = stripeSecret;
}
else if (builder.Environment.IsDevelopment())
{
    Console.WriteLine(
        "[配置] Stripe:SecretKey 未设置，结账接口将返回明确错误。本地请在 appsettings.Development.json 填写 sk_test_... 或设置 Stripe__SecretKey。");
}
builder.Services.AddScoped<IGA.Services.IStripeService, IGA.Services.StripeService>();
builder.Services.AddHttpClient<IGA.Services.IResendEmailService, IGA.Services.ResendEmailService>();
builder.Services.AddHttpClient(IGA.Services.TelegramNotificationService.HttpClientName, client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddScoped<IGA.Services.ITelegramNotificationService, IGA.Services.TelegramNotificationService>();

var app = builder.Build();

// 一次性清空所有商品（含订单明细中的行，因外键依赖）。用法：dotnet run -- --clear-products（仅 Development）
if (args.Contains("--clear-products"))
{
    if (!app.Environment.IsDevelopment())
    {
        Console.WriteLine("已拒绝：生产环境禁止 --clear-products。");
        return;
    }

    using var clearScope = app.Services.CreateScope();
    var clearDb = clearScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await clearDb.Database.ExecuteSqlRawAsync(@"DELETE FROM ""OrderItems""; DELETE FROM ""Products"";");
    Console.WriteLine("已清空所有商品及订单明细（OrderItems）。");
    return;
}

// 清空所有注册用户及订单（保留商品与店铺配置）。用法：dotnet run -- --clear-users（仅 Development）
if (args.Contains("--clear-users"))
{
    if (!app.Environment.IsDevelopment())
    {
        Console.WriteLine("已拒绝：生产环境禁止 --clear-users。");
        return;
    }

    using var userClearScope = app.Services.CreateScope();
    var userDb = userClearScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await userDb.Database.ExecuteSqlRawAsync(
        @"DELETE FROM ""OrderItems""; DELETE FROM ""Orders""; DELETE FROM ""PendingRegistrations""; DELETE FROM ""Users"";");
    Console.WriteLine("已清空所有用户及订单（OrderItems、Orders、PendingRegistrations、Users）。不再自动 Seed 用户；访客首次下单时会创建 guest@iga.local。");
    return;
}

// 蔬菜/水果清单写入数据库（非前端 mock）。用法：dotnet run -- --resync-all-catalogs（仅 Development）
if (args.Contains("--resync-all-catalogs"))
{
    if (!app.Environment.IsDevelopment())
    {
        Console.WriteLine("已拒绝：生产环境禁止 --resync-all-catalogs。");
        return;
    }

    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await CatalogDatabaseSync.ResyncAllCatalogsAsync(db);
    Console.WriteLine($"[数据库] 已写入蔬菜 {VegetableCatalogNames.Names.Length} 条、水果 {FruitCatalogNames.Names.Length} 条（已清空旧 Vegetables/Fruit 后重插）。");
    return;
}

// 仅替换当前蔬菜清单。用法：dotnet run -- --resync-vegetable-catalog（仅 Development）
if (args.Contains("--resync-vegetable-catalog"))
{
    if (!app.Environment.IsDevelopment())
    {
        Console.WriteLine("已拒绝：生产环境禁止 --resync-vegetable-catalog。");
        return;
    }

    using var syncScope = app.Services.CreateScope();
    var syncDb = syncScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await CatalogDatabaseSync.ResyncVegetablesOnlyAsync(syncDb);
    Console.WriteLine($"[数据库] 已同步蔬菜清单：共 {VegetableCatalogNames.Names.Length} 条。");
    return;
}

// 仅替换当前水果清单。用法：dotnet run -- --resync-fruit-catalog（仅 Development）
if (args.Contains("--resync-fruit-catalog"))
{
    if (!app.Environment.IsDevelopment())
    {
        Console.WriteLine("已拒绝：生产环境禁止 --resync-fruit-catalog。");
        return;
    }

    using var fruitScope = app.Services.CreateScope();
    var fruitDb = fruitScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await CatalogDatabaseSync.ResyncFruitOnlyAsync(fruitDb);
    Console.WriteLine($"[数据库] 已同步水果清单：共 {FruitCatalogNames.Names.Length} 条。");
    return;
}

// 5. 开发环境配置
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(); // 这就是您浏览器能看到的调试界面
}

app.UseCors();
// 开发环境禁用 HTTPS 重定向，避免 http://localhost:5212 被重定向导致 API 请求失败
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseStaticFiles(); // 托管 wwwroot 下的静态页面（success.html）
app.UseAuthorization();    // 身份验证中间件

// 6. 核心：映射所有的 Controller 接口
app.MapControllers();

// 7. 迁移 + 蔬菜/水果清单补全（不自动 Seed 用户或演示订单；管理员与客户须自行注册或通过数据库初始化）
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    // Railway / 生产库需与代码迁移一致；未执行迁移会出现「column ... does not exist」
    await db.Database.MigrateAsync();

    // 蔬菜/水果清单：按「分类 + 名称」判断是否存在（避免误把水果写在 Vegetables 时，同名挡住 Fruit 插入）
    var (vegAdded, fruitAdded) = await CatalogDatabaseSync.SeedMissingCatalogProductsAsync(db);
    if (vegAdded > 0 || fruitAdded > 0)
        Console.WriteLine($"[数据库] 启动时补全清单：蔬菜 +{vegAdded} 条，水果 +{fruitAdded} 条。");
}

app.Run();