/** 本地默认：与 launchSettings / Vite 代理一致 */
const DEFAULT_API_BASE = 'http://localhost:5212/api';
const DEFAULT_API_ORIGIN = 'http://localhost:5212';

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/** 若 `VITE_API_BASE` 以 `/api` 结尾则去掉，得到静态资源主机（/uploads 等） */
function originFromApiBase(base: string): string {
  const b = trimTrailingSlashes(base);
  const withoutApi = b.replace(/\/api$/i, '');
  return withoutApi || b;
}

/**
 * 生产环境在构建平台（如 Railway / Vercel）设置：
 * `VITE_API_BASE=https://你的后端.up.railway.app/api`
 * 须与 ASP.NET 控制器路由前缀 `api/` 一致。
 */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE;
  if (raw != null && String(raw).trim() !== '') return trimTrailingSlashes(String(raw));
  return DEFAULT_API_BASE;
}

/**
 * 商品图等静态资源根地址。可单独设 `VITE_API_ORIGIN`；
 * 未设置时由 `VITE_API_BASE` 推导（去掉末尾 `/api`）。
 */
export function getApiOrigin(): string {
  const rawOrigin = import.meta.env.VITE_API_ORIGIN;
  if (rawOrigin != null && String(rawOrigin).trim() !== '')
    return trimTrailingSlashes(String(rawOrigin));

  const rawBase = import.meta.env.VITE_API_BASE;
  if (rawBase != null && String(rawBase).trim() !== '') return originFromApiBase(String(rawBase));

  return DEFAULT_API_ORIGIN;
}

export const API_BASE = getApiBase();
export const API_ORIGIN = getApiOrigin();
