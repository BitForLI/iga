# 🧪 完整的 Stripe Checkout 支付功能测试指南

## 前置准备

### 1. 更新数据库（新增 StripeSessionId 字段）

由于修改了 `Order` 模型，需要创建新的迁移：

```bash
dotnet ef migrations add AddStripeSessionId
dotnet ef database update
```

### 2. 确保 Stripe CLI 已配置

```bash
# 验证 Stripe 登录状态
stripe status

# 启动 webhook 转发（在另一个终端保持运行）
stripe listen --forward-to localhost:5212/api/payment/webhook
```

记下输出中的 **Webhook signing secret**（格式如 `whsec_test_...`），填入 `appsettings.json`：

```json
{
  "Stripe": {
    "SecretKey": "sk_test_...",
    "WebhookSecret": "whsec_test_..."
  }
}
```

### 3. 启动应用

```bash
dotnet run
```

应该看到：
```
info: Microsoft.Hosting.Lifetime[14]
      Now listening on: http://localhost:5212
```

---

## 测试流程

### 步骤 1️⃣：创建用户（注册）

**请求：**
```bash
curl -X POST http://localhost:5212/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "Test User",
    "Email": "test@example.com",
    "PhoneNumber": "13775889218",
    "Password": "password123"
  }'
```

**响应示例：**
```json
{
  "message": "注册成功",
  "userId": 1
}
```

**记住 `userId = 1`**

---

### 步骤 2️⃣：创建商品

**请求：**
```bash
curl -X POST http://localhost:5212/api/product \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "Apple",
    "ImageUrl": "https://example.com/apple.jpg",
    "Category": "Veggie",
    "Price": 5.99,
    "Unit": "kg",
    "IsActive": true,
    "IsWeighingRequired": false
  }'
```

**响应示例：**
```json
{
  "message": "商品已创建",
  "productId": 1
}
```

**记住 `productId = 1`**

---

### 步骤 3️⃣：创建订单

**请求：**
```bash
curl -X POST http://localhost:5212/api/order/create \
  -H "Content-Type: application/json" \
  -d '{
    "UserId": 1,
    "OrderType": "Pickup",
    "PickupTime": "2026-02-10T15:00:00",
    "Items": [
      {
        "ProductId": 1,
        "Quantity": 2,
        "ExpectedWeight": 1.0
      }
    ]
  }'
```

**响应示例：**
```json
{
  "message": "订单已创建",
  "orderId": 1,
  "totalAmount": 11.98
}
```

**记住 `orderId = 1`**

---

### 步骤 4️⃣：创建 Checkout Session（进入支付）

**请求：**
```bash
curl -X POST http://localhost:5212/api/payment/create-checkout-session/1 \
  -H "Content-Type: application/json"
```

**响应：** HTTP 303 重定向
```
HTTP/1.1 303 See Other
Location: https://checkout.stripe.com/c/pay/cs_test_xxx...
```

**在浏览器中打开这个 URL**（或用 curl 的 `-L` 跟随重定向）

---

### 步骤 5️⃣：填写支付信息

在 Stripe Checkout 页面，使用 **Stripe 的测试卡**：

| 字段 | 值 |
|-----|-----|
| 卡号 | `4242 4242 4242 4242` |
| 过期日期 | `任意未来日期` (如 `12/25`) |
| CVC | `任意 3 位数` (如 `123`) |
| 邮编 | `任意邮编` (如 `12345`) |

点击 **"支付"** 按钮

---

### 步骤 6️⃣：验证支付成功

#### 方法 A：检查 Webhook 日志

在运行 `stripe listen` 的终端，应该看到：
```
2026-02-10 15:30:45 → checkout.session.completed [evt_test_xxx]
```

#### 方法 B：查询订单状态

**请求：**
```bash
curl http://localhost:5212/api/order/1
```

**响应应该显示：**
```json
{
  "Id": 1,
  "OrderStatus": "Paid",  // ✅ 已从 Pending 变为 Paid
  "StripeSessionId": "cs_test_xxx...",
  "TotalAmount": 11.98
}
```

---

### 步骤 7️⃣：测试取货验证（核销）

**请求：**
```bash
# 首先更新订单状态为 Prepared（由管理员操作）
curl -X PUT http://localhost:5212/api/order/1/status \
  -H "Content-Type: application/json" \
  -H "X-Admin-Id: [ADMIN_USER_ID]" \
  -d '{
    "NewStatus": "Prepared"
  }'

# 然后验证取货（客户输入手机后四位）
curl -X POST http://localhost:5212/api/order/1/verify \
  -H "Content-Type: application/json" \
  -d '{
    "PhoneLast4Digits": "9218"
  }'
```

**响应应该显示：**
```json
{
  "message": "订单已核销",
  "order": {
    "OrderStatus": "Completed"
  }
}
```

---

## 测试卡（Stripe 官方）

| 卡号 | 场景 |
|------|------|
| `4242 4242 4242 4242` | ✅ 支付成功（推荐） |
| `4000 0025 0000 3155` | ⏳ 需要 3D Secure 验证 |
| `4000 0000 0000 9995` | ❌ 支付失败（insufficient_funds） |

---

## 常见问题排查

### 问题 1: Webhook 没有收到

**检查：**
```bash
# 确认 Webhook 转发是否运行
stripe listen --forward-to localhost:5212/api/payment/webhook
```

**确保：**
- `appsettings.json` 中的 `Stripe:WebhookSecret` 与 CLI 输出的一致
- 应用正在 `localhost:5212` 上运行
- 数据库迁移已执行（`dotnet ef database update`）

### 问题 2: "Order not found" 错误

**原因：** 支付时订单 ID 被修改或未保存

**解决：**
- 确保用 **相同的 orderId** 调用 `create-checkout-session`
- 检查数据库中订单是否真的存在：
  ```bash
  # 在数据库中查询
  SELECT * FROM "Orders" WHERE "Id" = 1;
  ```

### 问题 3: "Invalid session object" 错误

**原因：** Stripe webhook payload 格式错误

**解决：**
- 确保 `Stripe:WebhookSecret` 正确（从 CLI 复制，不要手写）
- 检查 `PaymentController.Webhook()` 日志

---

## 🚀 快速测试脚本（全自动）

保存为 `test-payment.sh`，然后运行 `bash test-payment.sh`：

```bash
#!/bin/bash

BASE_URL="http://localhost:5212/api"
USER_ID=1
PRODUCT_ID=1

echo "1️⃣  创建用户..."
USER_RESPONSE=$(curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "Test User",
    "Email": "test-'$(date +%s)'@example.com",
    "PhoneNumber": "13775889218",
    "Password": "password123"
  }')
echo $USER_RESPONSE | grep -o '"userId":[0-9]*' | grep -o '[0-9]*'

echo "2️⃣  创建商品..."
curl -s -X POST $BASE_URL/product \
  -H "Content-Type: application/json" \
  -d '{
    "Name": "Test Product",
    "Category": "Veggie",
    "Price": 9.99,
    "Unit": "kg",
    "IsActive": true
  }'

echo "3️⃣  创建订单..."
ORDER_RESPONSE=$(curl -s -X POST $BASE_URL/order/create \
  -H "Content-Type: application/json" \
  -d '{
    "UserId": '$USER_ID',
    "OrderType": "Pickup",
    "PickupTime": "2026-02-10T15:00:00",
    "Items": [{"ProductId": '$PRODUCT_ID', "Quantity": 1, "ExpectedWeight": 1.0}]
  }')
ORDER_ID=$(echo $ORDER_RESPONSE | grep -o '"orderId":[0-9]*' | grep -o '[0-9]*')
echo "Order ID: $ORDER_ID"

echo "4️⃣  创建 Checkout Session..."
curl -i -X POST $BASE_URL/payment/create-checkout-session/$ORDER_ID

echo "✅ 测试完成！使用上面的 Checkout URL 进行支付"
```

---

## 📌 下一步

- 集成 **Telegram 通知**（商家收到新订单）
- 集成 **邮件确认**（客户支付成功）
- 实现 **退款逻辑**（在 OrderController 中使用 Stripe refund API）
- 添加 **称重退款**（ActualWeight 与 Stripe refund 的交互）

