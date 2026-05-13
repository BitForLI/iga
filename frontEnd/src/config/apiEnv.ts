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

/** 顾客站 apex 与 API 分域（api.）时的内置回退，避免未设 VITE_API_BASE 时请求打到静态站 /api 而 Failed to fetch */
function productionSplitHostApiBase(hostname: string): string | null {
  const h = hostname.toLowerCase();
  if (h === 'igabeverlyhills.com' || h === 'www.igabeverlyhills.com')
    return 'https://api.igabeverlyhills.com/api';
  return null;
}

function productionSplitHostApiOrigin(hostname: string): string | null {
  const h = hostname.toLowerCase();
  if (h === 'igabeverlyhills.com' || h === 'www.igabeverlyhills.com')
    return 'https://api.igabeverlyhills.com';
  return null;
}

/**
 * 生产环境在构建平台（如 Railway / Vercel）设置：
 * `VITE_API_BASE=https://你的后端.up.railway.app/api`
 * 须与 ASP.NET 控制器路由前缀 `api/` 一致。
 *
 * 若生产构建未注入 `VITE_API_BASE`，则按 hostname 尽量推断；顾客域与 API 分域时已内置 api 子域。
 * 其它域名仍回退为「当前站点 origin + /api」（适用于前端与 API 同域反代）。
 */
export function getApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE;
  if (raw != null && String(raw).trim() !== '') return trimTrailingSlashes(String(raw));

  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const split = productionSplitHostApiBase(window.location.hostname);
    if (split) return split;
    const o = window.location.origin;
    if (o && !o.includes('localhost') && !o.includes('127.0.0.1')) {
      return `${trimTrailingSlashes(o)}/api`;
    }
  }

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

  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const split = productionSplitHostApiOrigin(window.location.hostname);
    if (split) return split;
    const o = window.location.origin;
    if (o && !o.includes('localhost') && !o.includes('127.0.0.1')) {
      return trimTrailingSlashes(o);
    }
  }

  return DEFAULT_API_ORIGIN;
}

export const API_BASE = getApiBase();
export const API_ORIGIN = getApiOrigin();
