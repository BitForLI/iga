# 农贸市场 O2O 前端

## 项目结构

```
src/
├── api/
│   ├── client.ts       # Axios 配置和拦截器
│   └── index.ts        # API 端点定义
├── context/
│   └── AuthContext.tsx # 用户认证上下文
├── pages/
│   ├── Register.tsx    # 注册页面
│   ├── ProductList.tsx # 商品列表
│   ├── CreateOrder.tsx # 创建订单
│   ├── OrderStatus.tsx # 订单状态
│   └── OrderVerify.tsx # 核销验证
├── components/
│   └── Layout.tsx      # 布局组件
├── App.tsx             # 主应用组件
└── main.tsx            # 入口
```

## 快速开始

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`

## API 配置

修改 `src/api/client.ts` 中的 `API_BASE` 以指向后端地址。

## 功能

- ✅ 用户注册和登录
- ✅ 浏览商品列表
- ✅ 创建订单
- ✅ 支付集成（Stripe）
- ✅ 订单状态查询
- ✅ 订单核销验证

## 扩展性

- **添加新页面**：在 `src/pages/` 创建新组件，在 `App.tsx` 添加路由逻辑
- **添加新 API**：在 `src/api/index.ts` 定义新接口
- **修改样式**：使用 Tailwind CSS 工具类

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
