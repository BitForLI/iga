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

## 清空用户与订单（重测注册等）

**本地（Development）** 推荐用内置参数（会拒绝在生产环境执行）：

```bash
cd backend
dotnet run --launch-profile http -- --clear-users
```

会删除 `OrderItems`、`Orders`、`Users`；商品与 `StoreConfig` 保留。下次正常启动会按 `Program.cs` 再 Seed 访客账号等。

**生产 / Railway 数据库** 请连上 PostgreSQL 后执行脚本 **`scripts/clear-users-and-orders.sql`**，或在控制台运行与其中相同的 `DELETE` 语句；**务必备份**。
