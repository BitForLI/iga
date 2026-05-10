# IGA 项目说明

仓库布局：

```
├── backend/          # ASP.NET Core API（.csproj、Program.cs、Controllers、Models、Data、DTOs、Utils、Seed、Services、Migrations、wwwroot）
├── frontend/         # React + Vite
└── docs/             # 本文档
```

---

## 后端（`backend/`）

### 技术栈

- .NET 10，EF Core + Npgsql  
- 入口：`backend/Program.cs`（CORS、Swagger、迁移 `MigrateAsync`、Seed、开发用 CLI 参数）  
- 数据：`backend/Data/ApplicationDbContext.cs`，模型在 `backend/Models/`  
- 集成服务：`backend/Services/`（Stripe、Resend、Telegram、`OrderPaidNotifier`）

### 目录（要点）

| 路径 | 说明 |
|------|------|
| `backend/Controllers/` | `AuthController`、`ProductController`、`OrderController`、`PaymentController`、`AdminProductController` |
| `backend/DTOs/` | 请求/响应 DTO |
| `backend/Utils/` | 后台鉴权等辅助类（如 `BackofficeAuthHelper`） |
| `backend/Migrations/` | EF 迁移 |
| `backend/Properties/launchSettings.json` | 本地 `http://localhost:5212`，`ASPNETCORE_ENVIRONMENT=Development` |

### API 前缀

所有控制器路由为 **`/api/...`**（例如 `/api/order/create`、`/api/payment/webhook`）。

### 配置

- 基座：`backend/appsettings.json`  
- **生产域名（已入库）：** `backend/appsettings.Production.json` — CORS 允许 `https://www.igabeverlyhills.com` 与 `https://igabeverlyhills.com`；Stripe Checkout 成功/取消回跳至站点首页查询参数（与前端 `App.tsx` 一致）。部署后仍可用环境变量覆盖同名键。  
- 本地密钥：`backend/appsettings.Development.json`（已在 `.gitignore`，勿提交）  
- 生产：环境变量覆盖，常见键：

`ConnectionStrings__DefaultConnection`、`Stripe__*`、`Resend__*`、`Telegram__*`、`Cors__AllowedOrigins__0`

前端站点默认 Origin 见 `frontend/src/constants/site.ts`（可用 `VITE_PUBLIC_SITE_ORIGIN` 覆盖）。

### Railway 环境变量与代码对应（后端）

| Railway / 平台变量 | 代码中的配置键 | 说明 |
|-------------------|----------------|------|
| `ConnectionStrings__DefaultConnection` | `ConnectionStrings:DefaultConnection` | 主连接串；未设置时 **`Program.cs`** 会尝试解析 **`DATABASE_URL`**（插件常见注入） |
| `DATABASE_URL` | （运行时转为 Npgsql 连接串） | 仅当上一项为空时使用 |
| `Stripe__SecretKey` | `Stripe:SecretKey` | 与扁平名 **`STRIPE_SECRET_KEY`** 等价（后者仅在嵌套键为空时回填） |
| `Stripe__WebhookSecret` 或 **`STRIPE_WEBHOOK_SECRET`** | `Stripe:WebhookSecret` | Webhook 签名；扁平名由 **`Program.cs`** 的 `MapStripeFlatEnvIfNeeded` 映射 |
| `Stripe__PublishableKey` 或 **`STRIPE_PUBLISHABLE_KEY`** | `Stripe:PublishableKey` | 可选；当前结账以服务端 Checkout 为主 |
| `Cors__AllowedOrigins__0`、`__1`、… | `Cors:AllowedOrigins[]` | 与 `appsettings.Production.json` 叠加；生产仍会额外允许 localhost 便于调试 |

插件有时会附带 **`Host`**、**`Port`**、**`Username`**、**`Password`**、**`Database`** 等分拆变量：本仓库 **未读取**这些分拆项，只要 **`ConnectionStrings__DefaultConnection`** 或 **`DATABASE_URL`** 其一可用即可。

### 本地运行

```bash
cd backend
dotnet run --launch-profile http
```

Swagger（仅 Development）：`http://localhost:5212/swagger`

### 数据库迁移

```bash
cd backend
dotnet ef database update --project igaServer.csproj
```

（若从仓库根执行：`dotnet ef database update --project backend/igaServer.csproj`）

### 开发用命令行参数（仅 Development）

在 **`backend/`** 目录下执行 `dotnet run`：

- `dotnet run -- --clear-users` — 清空用户与订单  
- `dotnet run -- --clear-products` — 清空商品与订单明细  
- `dotnet run -- --resync-all-catalogs` 等 — 见 `Program.cs`

### 业务要点

- **注册/登录**：邮箱验证（Resend）；`name` / `email` / `password`，JSON 属性名大小写不敏感。  
- **支付**：Stripe Checkout；Webhook 将订单置为 `Paid`；本地可 `stripe listen --forward-to localhost:5212/api/payment/webhook`。  
- **称重退差**：`PUT /api/order/item/{itemId}/weight`，`X-Admin-Id`（Staff/Admin），已支付且有 PaymentIntent 时 **Stripe 部分退款**。  
- **新订单 Telegram**：`POST /api/order/create` 成功后发送。  
- **启动**：`Database.MigrateAsync()` 应用待处理迁移。

---

## 前端（`frontend/`）

### 技术栈

React 19、Vite、React Router、Ant Design、Axios

### 目录（要点）

| 路径 | 说明 |
|------|------|
| `frontend/src/App.tsx` | 路由：`/` 店铺；`/admin/*`；`/staff/*`；旧 `/admin/orders` → `/staff/orders` |
| `frontend/src/styles/globals.css` | 全局样式 |
| `frontend/src/config/apiEnv.ts` | `VITE_API_BASE`、`VITE_API_ORIGIN` |
| `frontend/src/constants/` | 布局、站点 Origin（`site.ts` 默认 `igabeverlyhills.com`） |
| `frontend/src/api/` | Axios 与各 API 封装 |
| `frontend/src/components/` | 页面级与可复用组件（含 `admin/`） |
| `frontend/src/context/` | React Context（购物车、登录、订单模式等） |
| `frontend/src/hooks/` | 自定义 Hooks |
| `frontend/src/layouts/` | 后台布局壳（Admin / Staff） |
| `frontend/src/pages/` | 路由页面（含 `admin/`） |
| `frontend/src/types/`、`utils/` | 类型与工具函数 |

路径别名：`@/` 指向 `src/`（见 `vite.config.ts`、`tsconfig.app.json`）。

### 本地运行

```bash
cd frontend
npm install
npm run dev
```

默认 `http://localhost:5173`。生产构建设置 `VITE_API_BASE` 指向线上 API（路径以 `/api` 结尾）。

### 后台入口（需对应角色登录）

- 管理员：`/admin`  
- 员工：`/staff/orders`

---

## 联调

1. PostgreSQL + 连接串 + 迁移（见上）。  
2. 后端：`cd backend && dotnet run --launch-profile http`。  
3. 前端：`cd frontend && npm run dev`。  
4. Stripe 测试：Webhook Secret 与 `stripe listen` 一致；测试卡 `4242 4242 4242 4242`。

---

## 部署（Railway / 类似平台）

- **后端服务**：仓库根目录选 **`backend`**（或构建上下文指向含 `igaServer.csproj` 的目录），启动一般为 `dotnet run` 或发布后的 `dotnet igaServer.dll`。  
- **前端静态站**：根目录 **`frontend`**，执行 `npm ci && npm run build`，用平台托管 **`frontend/dist`**。构建前设置 **`VITE_API_BASE`** = `https://你的后端公网地址/api`（见 `frontend/.env.example`）。  
- **仓库已包含**：`appsettings.Production.json` 中的生产域名与 Stripe 回跳 URL；**仍需在云平台手动填写**（勿提交密钥）：PostgreSQL 连接串、`Stripe__SecretKey` / `Stripe__WebhookSecret`（或扁平名 `STRIPE_*`，见 `Program.cs`）、Resend/Telegram 等。Stripe Dashboard **Live** 中 Webhook URL 须指向 `https://你的后端域名/api/payment/webhook`。  
- **勿提交**：`appsettings.Development.json`、任何含密钥的 `.env`。

---

## 许可证

未在仓库中声明时，以项目所有者约定为准。
