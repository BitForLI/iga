/** 与后端 `StoreDeliveryHelper.AllowedDeliverySuburbKeys` 一致：trim + lowercase 即为 suburbKey。 */
export const DELIVERY_SUBURBS = [
  'Riverwood',
  'Roselands',
  'Kingsgrove',
  'Bexley North',
  'Bexley',
  'Rockdale',
  'Kogarah',
  'Carlton',
  'Allawah',
  'Hurstville',
  'Penshurst',
  'Beverly Hills',
  'Wolli Creek',
  'Arncliffe',
] as const;

export type DeliverySuburbName = (typeof DELIVERY_SUBURBS)[number];

export function suburbToKey(suburb: string | undefined | null): string {
  return (suburb ?? '').trim().toLowerCase();
}

/** 与后端 `NormalizeSuburbKey` 对齐（旧订单可能仍为 roseland）。 */
export function normalizeSuburbKey(suburb: string | undefined | null): string {
  let k = suburbToKey(suburb);
  if (k === 'roseland') k = 'roselands';
  return k;
}

export function isDeliverableSuburb(suburb: string | undefined | null): boolean {
  const k = normalizeSuburbKey(suburb);
  if (!k) return false;
  return DELIVERY_SUBURBS.some((name) => suburbToKey(name) === k);
}

export const DELIVERY_SUBURB_DISPLAY_BY_KEY: Record<string, string> = Object.fromEntries(
  DELIVERY_SUBURBS.map((name) => [suburbToKey(name), name])
);
DELIVERY_SUBURB_DISPLAY_BY_KEY.roseland = 'Roselands';

export function formatDeliverySuburbDisplay(raw: string | undefined): string {
  const k = normalizeSuburbKey(raw);
  if (!k) return '—';
  return DELIVERY_SUBURB_DISPLAY_BY_KEY[k] ?? raw!.trim();
}
