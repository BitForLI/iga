/**
 * 顾客站点公网 Origin（canonical、分享链接等）。
 * 构建时可通过 `VITE_PUBLIC_SITE_ORIGIN` 覆盖；默认与后端 `appsettings.Production.json` 中 Stripe 回跳域名一致。
 */
export const SITE_ORIGIN = (
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN as string | undefined
)?.trim() || 'https://www.igabeverlyhills.com';
