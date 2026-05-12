import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storePublicAPI } from '../api';

export type DeliveryZonePublic = { suburbKey: string; displayName: string; feeAud: number };

export type StorePublicSettings = {
  freeShippingMinAud: number;
  deliveryZones: DeliveryZonePublic[];
  homeCarouselImageUrls: string[];
};

type Ctx = {
  settings: StorePublicSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const StorePublicSettingsContext = createContext<Ctx | undefined>(undefined);

const zoneDisplay: Record<string, string> = {
  hurstville: 'Hurstville',
  allawah: 'Allawah',
  carlton: 'Carlton',
  roseland: 'Roseland',
};

const defaultSettings = (): StorePublicSettings => ({
  freeShippingMinAud: 69,
  deliveryZones: ['hurstville', 'allawah', 'carlton', 'roseland'].map((suburbKey) => ({
    suburbKey,
    displayName: zoneDisplay[suburbKey] ?? suburbKey,
    feeAud: 10,
  })),
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
        deliveryZones: Array.isArray(parsed.deliveryZones) ? parsed.deliveryZones : defaultSettings().deliveryZones,
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
  const key = (suburb ?? '').trim().toLowerCase();
  if (!key) return 0;
  const row = cfg.deliveryZones.find((z) => z.suburbKey.toLowerCase() === key);
  if (!row) return 0;
  return Math.max(0, Number(row.feeAud) || 0);
}
