/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端 API 根地址，须含 `/api`，如 https://xxx.up.railway.app/api */
  readonly VITE_API_BASE?: string;
  /** 可选；不设置则从 VITE_API_BASE 去掉 `/api` 用于 /uploads 等静态资源 */
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
