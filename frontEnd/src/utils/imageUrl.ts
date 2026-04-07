/** 后端静态资源根地址（与 Vite dev server 不同源时需拼接相对路径） */
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:5212';

/**
 * 将商品图片地址转为浏览器可请求的绝对 URL。
 * - 已是 http(s) 则原样返回
 * - 以 `/` 开头的相对路径则拼到 API 主机
 */
export function resolveProductImageUrl(url: string | undefined | null, fallback: string): string {
  if (!url?.trim()) return fallback;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${API_ORIGIN}${u}`;
  return u;
}
