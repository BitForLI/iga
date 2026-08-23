# IGA 后端（ASP.NET Core）

本目录包含 **`igaServer.csproj`** 与全部 API 源码。

## Railway / Railpack

在托管平台的 **Service → Settings → Root directory** 中必须填写：

```text
backend
```

若保留为仓库根目录 `/`，构建会在根路径查找 `.csproj`，会出现 **「could not determine how to build the app」**。将根目录设为 `backend` 后，Railpack 才会扫描到 `igaServer.csproj`。

可选：**Watch paths** 设为 `backend/**`，避免仅前端变更触发后端重建。

本地运行：

```bash
cd backend
dotnet run --launch-profile http
```

## 生产环境安全配置

部署前至少设置以下环境变量；不要把真实值写入仓库：

```text
ASPNETCORE_ENVIRONMENT=Production
Jwt__SigningKey=<至少 32 字节的随机密钥>
ConnectionStrings__DefaultConnection=<Ssl Mode=VerifyFull;Trust Server Certificate=false 的 PostgreSQL 连接串>
Cors__AllowedOrigins__0=https://igabeverlyhills.com
Stripe__SecretKey=...
Stripe__WebhookSecret=...
Stripe__SuccessUrl=https://igabeverlyhills.com/?payment=success&orderId={orderId}
Stripe__CancelUrl=https://igabeverlyhills.com/?payment=cancelled&orderId={orderId}
```

首次创建后台账号时可临时设置 `BootstrapAdmin__Email`、`BootstrapAdmin__Password`、
`BootstrapStaff__Email`、`BootstrapStaff__Password`。密码必须为 12–128 个字符；账号创建后应从托管平台移除这些密码变量。
启动过程不会重置已有账号密码，也不会再创建硬编码账号。

旧版本使用 SHA-256 保存密码。普通顾客首次成功登录后会自动升级为 PBKDF2；Admin/Staff 的旧密码会被拒绝，必须通过邮箱重置流程先轮换密码。

## 清空用户与订单（重测注册等）

**本地（Development）** 推荐用内置参数（会拒绝在生产环境执行）：

```bash
cd backend
dotnet run --launch-profile http -- --clear-users
```

会删除 `OrderItems`、`Orders`、`Users`；商品与 `StoreConfig` 保留。下次正常启动只会按明确配置的 Bootstrap 环境变量创建后台账号。

**生产 / Railway 数据库** 请连上 PostgreSQL 后执行脚本 **`scripts/clear-users-and-orders.sql`**，或在控制台运行与其中相同的 `DELETE` 语句；**务必备份**。
