import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storePublicAPI } from '../api';
import { DELIVERY_SUBURBS, normalizeSuburbKey, suburbToKey } from '../constants/deliveryZones';

export type DeliveryZonePublic = { suburbKey: string; displayName: string; feeAud: number; enabled: boolean };
export type DeliveryFeeRulePublic = { minAmount: number; feeAud: number };

export type StorePublicSettings = {
  freeShippingMinAud: number;
  deliveryZones: DeliveryZonePublic[];
  deliveryFeeRules: DeliveryFeeRulePublic[];
  homeCarouselImageUrls: string[];
};

type Ctx = {
  settings: StorePublicSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const StorePublicSettingsContext = createContext<Ctx | undefined>(undefined);

const defaultSettings = (): StorePublicSettings => ({
  freeShippingMinAud: 69,
  deliveryZones: DELIVERY_SUBURBS.map((displayName) => ({
    suburbKey: suburbToKey(displayName),
    displayName,
    feeAud: 10,
    enabled: true,
  })),
  deliveryFeeRules: [
    { minAmount: 0, feeAud: 10 },
    { minAmount: 69, feeAud: 0 },
  ],
  homeCarouselImageUrls: [],
});

export function StorePublicSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StorePublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // apiClient 拦截器已返回 response.data，此处不是 AxiosResponse，勿解构 .data
      const parsed = (await storePublicAPI.getPublicSettings()) as unknown as StorePublicSettings;
      setSettings({
        freeShippingMinAud: Number(parsed.freeShippingMinAud) || 69,
        deliveryZones: Array.isArray(parsed.deliveryZones)
          ? parsed.deliveryZones.map((z) => ({
              suburbKey: String(z.suburbKey ?? ''),
              displayName: String(z.displayName ?? z.suburbKey ?? ''),
              feeAud: Number(z.feeAud) || 0,
              enabled: z.enabled !== false,
            }))
          : defaultSettings().deliveryZones,
        deliveryFeeRules: Array.isArray(parsed.deliveryFeeRules)
          ? parsed.deliveryFeeRules.map((r) => ({
              minAmount: Number(r.minAmount) || 0,
              feeAud: Number(r.feeAud) || 0,
            }))
          : defaultSettings().deliveryFeeRules,
        homeCarouselImageUrls: Array.isArray(parsed.homeCarouselImageUrls) ? parsed.homeCarouselImageUrls : [],
      });
    } catch (e) {
      setError((e as Error).message);
      setSettings(defaultSettings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({ settings, loading, error, reload }),
    [settings, loading, error, reload]
  );

  return <StorePublicSettingsContext.Provider value={value}>{children}</StorePublicSettingsContext.Provider>;
}

export function useStorePublicSettings() {
  const c = useContext(StorePublicSettingsContext);
  if (!c) throw new Error('useStorePublicSettings must be used within StorePublicSettingsProvider');
  return c;
}

/** Match server: subtotal is cart goods only; suburb e.g. Hurstville (matched via lower key). */
export function computeDeliveryFeeAud(
  subtotal: number,
  suburb: string | undefined,
  s: StorePublicSettings | null
): number {
  const cfg = s ?? defaultSettings();
  if (subtotal >= cfg.freeShippingMinAud) return 0;
  const key = normalizeSuburbKey(suburb);
  if (!key) return 0;
  const row = cfg.deliveryZones.find((z) => normalizeSuburbKey(z.suburbKey) === key);
  if (!row || !row.enabled) return 0;

  const rule = cfg.deliveryFeeRules
    .slice()
    .sort((a, b) => a.minAmount - b.minAmount)
    .reduce<{
      minAmount: number;
      feeAud: number;
    } | null>((selected, current) => {
      if (subtotal >= current.minAmount) {
        return current;
      }
      return selected;
    }, null);

  if (!rule) {
    return Math.max(0, Number(row.feeAud) || 0);
  }

  return Math.max(0, Number(rule.feeAud) || 0);
}
