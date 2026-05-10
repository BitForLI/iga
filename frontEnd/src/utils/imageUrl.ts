import { API_ORIGIN } from '../config/apiEnv';

function debugImageIssue(
  runId: string,
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
): void {
  // #region agent log
  fetch('http://127.0.0.1:7704/ingest/f17ff0ef-6b97-4a80-8e19-1b534d0488ed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '936b1a' },
    body: JSON.stringify({
      sessionId: '936b1a',
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

/**
 * 将商品图片地址转为浏览器可请求的绝对 URL。
 * - 已是 http(s) 则原样返回
 * - 以 `/` 开头的相对路径则拼到 API 主机
 */
export function resolveProductImageUrl(url: string | undefined | null, fallback: string): string {
  if (!url?.trim()) return fallback;
  const u = url.trim();
  if (/^\/?images\/main\.png$/i.test(u)) {
    debugImageIssue('post-fix', 'H2', 'frontEnd/src/utils/imageUrl.ts:35', 'legacy placeholder image path uses bundled fallback', {
      input: u,
      fallback,
    });
    return fallback;
  }
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${API_ORIGIN}${u}`;
  return u;
}
