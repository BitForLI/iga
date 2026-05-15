import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { EnvironmentOutlined, CarOutlined } from '@ant-design/icons';
import { useOrderMode, type OrderType } from '../context/OrderModeContext';
import { API_BASE } from '../config/apiEnv';
import { DELIVERY_SUBURBS, normalizeSuburbKey, suburbToKey } from '../constants/deliveryZones';
import { useStorePublicSettings } from '../context/StorePublicSettingsContext';

export { DELIVERY_SUBURBS } from '../constants/deliveryZones';

const PICKUP_ADDRESS = 'Beverly Hills IGA';
const MAP_LINK = 'https://www.google.com/maps/search/Beverly+Hills+IGA+Beverly+Hills+NSW';

const PICKUP_SLOT_MS = 60 * 60 * 1000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const [y, m, day] = key.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const PICKUP_OPEN_HOUR = 9;
const PICKUP_CLOSE_HOUR = 20;

function pickupWindowEnd(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, PICKUP_CLOSE_HOUR, 0, 0, 0);
}

function pickupWindowStart(now: Date): Date {
  const lead = new Date(now.getTime() + 60 * 60 * 1000);
  const todayOpen = new Date(now.getFullYear(), now.getMonth(), now.getDate(), PICKUP_OPEN_HOUR, 0, 0, 0);
  const todayClose = new Date(now.getFullYear(), now.getMonth(), now.getDate(), PICKUP_CLOSE_HOUR, 0, 0, 0);
  const tomorrowOpen = new Date(todayOpen.getTime() + DAY_MS);

  if (lead < todayOpen) {
    return todayOpen;
  }
  if (lead >= todayClose) {
    return tomorrowOpen;
  }
  return lead;
}

function ceilToNextHour(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
  if (out.getTime() < d.getTime()) {
    out.setHours(out.getHours() + 1);
  }
  return out;
}

/** 仅展示时间段（不含星期、日期、月份），例如 2:00 am – 3:00 am */
function generateAllPickupSlots(now: Date): { displayTime: string; value: string; dayKey: string }[] {
  const wStart = pickupWindowStart(now);
  const wEnd = pickupWindowEnd(now);
  if (wStart >= wEnd) return [];
  let t = ceilToNextHour(wStart);
  const fmtHm = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const out: { displayTime: string; value: string; dayKey: string }[] = [];
  while (t < wEnd) {
    const slotEnd = new Date(t.getTime() + PICKUP_SLOT_MS);
    if (slotEnd > wEnd) break;
    out.push({
      displayTime: `${fmtHm.format(t)} – ${fmtHm.format(slotEnd)}`,
      value: t.toISOString(),
      dayKey: dateKey(t),
    });
    t = slotEnd;
  }
  return out;
}

function generateDayCardsForPickup(now: Date): { key: string; dayTop: string; dayBottom: string }[] {
  const all = generateAllPickupSlots(now);
  const keys = [...new Set(all.map((s) => s.dayKey))].sort();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const fmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });
  return keys.map((key) => {
    const d = parseDateKey(key);
    let dayTop: string;
    if (sameDay(d, today)) dayTop = 'Today';
    else if (sameDay(d, tomorrow)) dayTop = 'Tomorrow';
    else dayTop = WEEKDAY[d.getDay()];
    return { key, dayTop, dayBottom: fmt.format(d) };
  });
}

export type AddressSuggestion = {
  id: string;
  placeName: string;
  streetAddress: string;
  suburb: string;
  postcode: string;
  state: string;
};

async function fetchAddressSuggestApi(query?: string): Promise<{ configured: boolean; suggestions: AddressSuggestion[] }> {
  const q = query?.trim() ?? '';
  const qs = q.length >= 3 ? `?query=${encodeURIComponent(q)}` : '';
  const r = await fetch(`${API_BASE}/address/suggest${qs}`);
  if (!r.ok) {
    let extra = '';
    try {
      const j = (await r.json()) as { error?: string };
      if (j?.error) extra = `: ${j.error}`;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(String(r.status) + extra);
  }
  const j = (await r.json()) as { configured?: boolean; suggestions?: AddressSuggestion[] };
  return {
    configured: !!j.configured,
    suggestions: Array.isArray(j.suggestions) ? j.suggestions : [],
  };
}

export type FulfillmentOptionsVariant = 'sidebar' | 'checkoutModal';

export interface FulfillmentOptionsFormProps {
  variant: FulfillmentOptionsVariant;
  /** When false, slot lists stay empty (parent drawer closed or modal hidden). */
  active: boolean;
  onSidebarClose?: () => void;
}

export function FulfillmentOptionsForm({ variant, active, onSidebarClose }: FulfillmentOptionsFormProps) {
  const [addressError, setAddressError] = useState('');
  const [addressInputDirty, setAddressInputDirty] = useState(false);
  const { orderType, setOrderType, pickupTimeSlot, setPickupTimeSlot, deliveryInfo, setDeliveryInfo, saveDeliveryAddress } =
    useOrderMode();
  const { settings: storeSettings } = useStorePublicSettings();
  const [slotNow, setSlotNow] = useState(() => new Date());
  const [pickupDayKey, setPickupDayKey] = useState('');

  const enabledDeliveryZones = useMemo(() => {
    if (!storeSettings?.deliveryZones?.length) {
      return DELIVERY_SUBURBS.map((displayName) => ({
        suburbKey: suburbToKey(displayName),
        displayName,
      }));
    }
    return storeSettings.deliveryZones.filter((zone) => zone.enabled).map((zone) => ({
      suburbKey: zone.suburbKey,
      displayName: zone.displayName,
    }));
  }, [storeSettings]);

  const isInDeliveryZone = useCallback(
    (suburb: string): boolean => {
      const key = normalizeSuburbKey(suburb);
      if (!key) return false;
      return enabledDeliveryZones.some((zone) => normalizeSuburbKey(zone.suburbKey) === key);
    },
    [enabledDeliveryZones]
  );

  const deliveryZoneDisplayNames = useMemo(
    () => enabledDeliveryZones.map((zone) => zone.displayName),
    [enabledDeliveryZones]
  );

  const [addrBackendConfigured, setAddrBackendConfigured] = useState<boolean | null>(null);
  const [addrSuggestions, setAddrSuggestions] = useState<AddressSuggestion[]>([]);
  const [addrSuggestOpen, setAddrSuggestOpen] = useState(false);
  const [addrSuggestHighlight, setAddrSuggestHighlight] = useState(-1);
  const [addrSuggestLoading, setAddrSuggestLoading] = useState(false);
  const addrSuggestWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (active) setSlotNow(new Date());
  }, [active]);

  const dayCards = useMemo(() => {
    if (!active) return [];
    return generateDayCardsForPickup(slotNow);
  }, [active, slotNow]);

  const allPickupSlots = useMemo(() => {
    if (!active) return [];
    return generateAllPickupSlots(slotNow);
  }, [active, slotNow]);

  useEffect(() => {
    if (!active || allPickupSlots.length === 0) return;
    if (pickupTimeSlot && !allPickupSlots.some((s) => s.value === pickupTimeSlot)) {
      setPickupTimeSlot('');
    }
  }, [active, allPickupSlots, pickupTimeSlot, setPickupTimeSlot]);

  useEffect(() => {
    if (!active || orderType !== 'Pickup' || dayCards.length === 0) return;
    if (!pickupDayKey) return;
    if (!dayCards.some((d) => d.key === pickupDayKey)) {
      setPickupDayKey('');
      setPickupTimeSlot('');
    }
  }, [active, orderType, dayCards, pickupDayKey, setPickupTimeSlot]);

  useEffect(() => {
    if (!pickupTimeSlot || allPickupSlots.length === 0) return;
    const slot = allPickupSlots.find((s) => s.value === pickupTimeSlot);
    if (slot) setPickupDayKey(slot.dayKey);
  }, [pickupTimeSlot, allPickupSlots]);

  const handlePickupDayChange = useCallback(
    (key: string) => {
      setPickupDayKey(key);
      const current = pickupTimeSlot;
      if (current && !allPickupSlots.some((s) => s.value === current && s.dayKey === key)) {
        setPickupTimeSlot('');
      }
    },
    [allPickupSlots, pickupTimeSlot, setPickupTimeSlot]
  );

  useEffect(() => {
    if (!active) setAddrBackendConfigured(null);
  }, [active]);

  useEffect(() => {
    if (!active || orderType !== 'Delivery') return;
    let cancelled = false;
    (async () => {
      try {
        const { configured } = await fetchAddressSuggestApi();
        if (!cancelled) setAddrBackendConfigured(configured);
      } catch {
        if (!cancelled) setAddrBackendConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, orderType]);

  useEffect(() => {
    if (!active || orderType !== 'Delivery' || addrBackendConfigured !== true) return;
    const q = (deliveryInfo.address ?? '').trim();
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (q.length < 3) {
        if (!cancelled) {
          setAddrSuggestions([]);
          setAddrSuggestOpen(false);
          setAddrSuggestHighlight(-1);
          setAddrSuggestLoading(false);
        }
        return;
      }
      setAddrSuggestLoading(true);
      setAddressError('');
      try {
        const { suggestions } = await fetchAddressSuggestApi(q);
        if (!cancelled) {
          setAddrSuggestions(suggestions);
          setAddrSuggestHighlight(-1);
          setAddrSuggestOpen(suggestions.length > 0);
        }
      } catch (e) {
        if (!cancelled) {
          const hint = e instanceof Error && e.message ? ` (${e.message})` : '';
          setAddressError(
            `Address search failed${hint}. Try again or use manual entry below.`
          );
          setAddrSuggestions([]);
          setAddrSuggestOpen(false);
          setAddrSuggestHighlight(-1);
        }
      } finally {
        if (!cancelled) setAddrSuggestLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [active, orderType, addrBackendConfigured, deliveryInfo.address]);

  useEffect(() => {
    if (!addrSuggestOpen) return;
    const close = (ev: MouseEvent) => {
      const el = addrSuggestWrapRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setAddrSuggestOpen(false);
        setAddrSuggestHighlight(-1);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [addrSuggestOpen]);

  const applyAddressSuggestion = useCallback((s: AddressSuggestion) => {
    const suburb = (s.suburb ?? '').trim();
    const address = (s.streetAddress ?? '').trim();
    const postcode = (s.postcode ?? '').trim();
    setAddressInputDirty(false);
    setAddrSuggestOpen(false);
    setAddrSuggestHighlight(-1);
    setAddrSuggestions([]);
    setDeliveryInfo((prev) => ({ ...prev, address, suburb, postcode }));
    if (isInDeliveryZone(suburb)) setAddressError('');
    else
      setAddressError(
        suburb
          ? `This address (${suburb}) is outside our delivery zone. We only deliver to: ${deliveryZoneDisplayNames.join(', ')}.`
          : 'Unable to verify delivery zone for this address. Please confirm it is within our delivery area'
      );
  }, [setDeliveryInfo]);

  const handleOrderTypeChange = (t: OrderType) => {
    setOrderType(t);
  };

  const showSidebarActions = variant === 'sidebar' && typeof onSidebarClose === 'function';

  const slotsForSelectedDay = useMemo(
    () => allPickupSlots.filter((s) => s.dayKey === pickupDayKey),
    [allPickupSlots, pickupDayKey]
  );

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {orderType === 'Pickup' ? (
            <EnvironmentOutlined style={{ fontSize: '1rem', color: '#dc2626', marginTop: 2 }} />
          ) : (
            <CarOutlined style={{ fontSize: '1rem', color: '#dc2626', marginTop: 2 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
              {orderType === 'Pickup' ? 'Pickup from:' : 'Delivery to:'}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontWeight: 600, fontSize: '1rem', color: '#0a0a0a' }}>
              {orderType === 'Pickup'
                ? PICKUP_ADDRESS
                : deliveryInfo.suburb
                  ? `${deliveryInfo.address}, ${deliveryInfo.suburb}`
                  : 'Please enter delivery address'}
            </p>
          </div>
          {orderType === 'Pickup' && (
            <a
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.35rem 0.75rem',
                border: '2px solid #dc2626',
                borderRadius: 6,
                color: '#dc2626',
                fontSize: '0.8rem',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              View Map
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => handleOrderTypeChange('Pickup')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            border: 'none',
            borderBottom: orderType === 'Pickup' ? '2px solid #dc2626' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: orderType === 'Pickup' ? 600 : 400,
            color: orderType === 'Pickup' ? '#dc2626' : '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
          }}
        >
          <EnvironmentOutlined /> Pickup
        </button>
        <button
          type="button"
          onClick={() => handleOrderTypeChange('Delivery')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            border: 'none',
            borderBottom: orderType === 'Delivery' ? '2px solid #dc2626' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: orderType === 'Delivery' ? 600 : 400,
            color: orderType === 'Delivery' ? '#dc2626' : '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
          }}
        >
          <CarOutlined /> Delivery
        </button>
      </div>

      {orderType === 'Pickup' ? (
        <div>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#0a0a0a' }}>Select pickup time slot</p>
          {dayCards.length === 0 || allPickupSlots.length === 0 ? (
            <p style={{ margin: 0, padding: '12px 0', fontSize: 14, color: '#64748b' }}>
              No pickup slots in the current window. Please try again later.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: pickupDayKey ? 12 : 0, flexWrap: 'wrap' }}>
                {dayCards.map((d) => {
                  const selected = pickupDayKey === d.key;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => handlePickupDayChange(d.key)}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: selected ? '2px solid #dc2626' : '1px solid #e5e7eb',
                        background: 'white',
                        color: selected ? '#dc2626' : '#0a0a0a',
                        fontWeight: selected ? 600 : 500,
                        fontSize: 14,
                        cursor: 'pointer',
                        lineHeight: 1.25,
                      }}
                    >
                      {d.dayTop} {d.dayBottom}
                    </button>
                  );
                })}
              </div>
              {pickupDayKey ? (
                <>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 6 }}>Time</label>
                  <select
                    value={pickupTimeSlot}
                    onChange={(e) => setPickupTimeSlot(e.target.value)}
                    aria-label="Pickup time slot"
                    style={{
                      width: '100%',
                      marginBottom: '0.75rem',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      background: 'white',
                      fontSize: 15,
                      fontWeight: 500,
                      color: '#0a0a0a',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">Choose a time…</option>
                    {slotsForSelectedDay.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.displayTime}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </>
          )}
          {showSidebarActions && (
            <button
              type="button"
              disabled={!pickupTimeSlot}
              onClick={() => pickupTimeSlot && onSidebarClose?.()}
              style={{
                marginTop: '0.75rem',
                width: '100%',
                padding: '0.5rem 1rem',
                backgroundColor: pickupTimeSlot ? '#dc2626' : '#e5e7eb',
                color: pickupTimeSlot ? 'white' : '#9ca3af',
                border: 'none',
                borderRadius: 6,
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: pickupTimeSlot ? 'pointer' : 'not-allowed',
              }}
            >
              Confirm
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Contact name"
            value={deliveryInfo.contactName ?? ''}
            onChange={(e) => setDeliveryInfo({ ...deliveryInfo, contactName: e.target.value })}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
          <input
            type="tel"
            placeholder="Contact phone"
            value={deliveryInfo.contactPhone ?? ''}
            onChange={(e) => setDeliveryInfo({ ...deliveryInfo, contactPhone: e.target.value })}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />

          {addrBackendConfigured === null ? (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Loading address search…</p>
          ) : addrBackendConfigured ? (
            <>
              <form
                onSubmit={(e) => e.preventDefault()}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                <div
                  ref={addrSuggestWrapRef}
                  style={{
                    position: 'relative',
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    background: 'white',
                  }}
                >
                  <EnvironmentOutlined
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: 12,
                      color: '#9ca3af',
                      fontSize: '1rem',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  />
                  <input
                    name="address"
                    type="text"
                    autoComplete="off"
                    placeholder="Street address (type 3+ characters)…"
                    data-lpignore="true"
                    value={deliveryInfo.address ?? ''}
                    onChange={(e) => {
                      setAddressInputDirty(true);
                      setAddressError('');
                      setAddrSuggestHighlight(-1);
                      setDeliveryInfo({ ...deliveryInfo, address: e.target.value });
                    }}
                    onFocus={() => {
                      if (addrSuggestions.length > 0) setAddrSuggestOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setAddrSuggestOpen(false);
                        setAddrSuggestHighlight(-1);
                        return;
                      }
                      const list = addrSuggestions;
                      if (list.length === 0) return;

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setAddrSuggestOpen(true);
                        setAddrSuggestHighlight((i) => (i + 1) % list.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setAddrSuggestOpen(true);
                        setAddrSuggestHighlight((i) => (i <= 0 ? list.length - 1 : i - 1));
                        return;
                      }
                      if (e.key === 'Enter' && addrSuggestOpen) {
                        const idx = addrSuggestHighlight >= 0 ? addrSuggestHighlight : 0;
                        const sug = list[idx];
                        if (sug) {
                          e.preventDefault();
                          applyAddressSuggestion(sug);
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '0.5rem 0.75rem 0.5rem 2rem',
                      border: 'none',
                      fontSize: '0.875rem',
                      outline: 'none',
                      background: 'transparent',
                    }}
                  />
                  {addrSuggestLoading ? (
                    <p style={{ margin: 0, padding: '4px 10px 8px', fontSize: '0.72rem', color: '#9ca3af' }}>Searching…</p>
                  ) : null}
                  {addrSuggestOpen && addrSuggestions.length > 0 ? (
                    <ul
                      role="listbox"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '100%',
                        margin: '4px 0 0 0',
                        padding: 4,
                        listStyle: 'none',
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        maxHeight: 220,
                        overflowY: 'auto',
                        zIndex: 1200,
                      }}
                    >
                      {addrSuggestions.map((sug, idx) => (
                        <li key={sug.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={addrSuggestHighlight === idx}
                            onPointerDown={(ev) => {
                              ev.preventDefault();
                              applyAddressSuggestion(sug);
                            }}
                            style={{
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 10px',
                              border: 'none',
                              borderRadius: 6,
                              background: addrSuggestHighlight === idx ? '#f3f4f6' : 'transparent',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              lineHeight: 1.35,
                              color: '#0a0a0a',
                            }}
                          >
                            {sug.placeName || `${sug.streetAddress}, ${sug.suburb} ${sug.postcode}`.trim()}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <input
                  name="suburb"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="Suburb"
                  value={deliveryInfo.suburb ?? ''}
                  readOnly
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: '0.875rem',
                    background: '#f9fafb',
                    color: '#6b7280',
                  }}
                />
                <input
                  name="postcode"
                  type="text"
                  autoComplete="postal-code"
                  placeholder="Postcode"
                  value={deliveryInfo.postcode ?? ''}
                  readOnly
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: '0.875rem',
                    background: '#f9fafb',
                    color: '#6b7280',
                  }}
                />
              </form>
              {addressError && <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>{addressError}</p>}
              {!addressError && !addressInputDirty && deliveryInfo.suburb && (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#16a34a' }}>✓ Within delivery zone ({deliveryInfo.suburb})</p>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.8rem',
                  color: '#92400e',
                  background: '#fffbeb',
                  padding: '8px 10px',
                  borderRadius: 6,
                  lineHeight: 1.4,
                }}
              >
                Address search is off until the server has a Mapbox token. Set <strong>Mapbox:AccessToken</strong> in backend
                settings or environment variable <strong>MAPBOX_ACCESS_TOKEN</strong>, then redeploy. You can still enter your
                street and suburb below.
              </p>
              <input
                type="text"
                placeholder="Street address"
                value={deliveryInfo.address ?? ''}
                onChange={(e) => {
                  setAddressInputDirty(true);
                  setAddressError('');
                  setDeliveryInfo({ ...deliveryInfo, address: e.target.value });
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Suburb (delivery area)
                <select
                  value={deliveryInfo.suburb ?? ''}
                  onChange={(e) => {
                    const suburb = e.target.value;
                    setAddressInputDirty(false);
                    if (!suburb) {
                      setDeliveryInfo({ ...deliveryInfo, suburb: '' });
                      setAddressError('');
                      return;
                    }
                    if (isInDeliveryZone(suburb)) {
                      setDeliveryInfo({ ...deliveryInfo, suburb });
                      setAddressError('');
                    } else {
                      setDeliveryInfo({ ...deliveryInfo, suburb });
                      setAddressError(`Please choose one of: ${deliveryZoneDisplayNames.join(', ')}.`);
                    }
                  }}
                  style={{
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: '0.875rem',
                    background: 'white',
                  }}
                >
                  <option value="">Select suburb…</option>
                  {deliveryZoneDisplayNames.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Postcode"
                value={deliveryInfo.postcode ?? ''}
                onChange={(e) => {
                  setDeliveryInfo({ ...deliveryInfo, postcode: e.target.value });
                }}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
              {addressError ? <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>{addressError}</p> : null}
              {!addressError && deliveryInfo.suburb && isInDeliveryZone(deliveryInfo.suburb) ? (
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#16a34a' }}>✓ Delivery area: {deliveryInfo.suburb}</p>
              ) : null}
            </div>
          )}
          <input
            type="text"
            placeholder="Unit number (optional)"
            value={deliveryInfo.unitNumber ?? ''}
            onChange={(e) => setDeliveryInfo({ ...deliveryInfo, unitNumber: e.target.value })}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
          {showSidebarActions && (
            <button
              type="button"
              onClick={() => {
                saveDeliveryAddress();
                onSidebarClose?.();
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save address
            </button>
          )}
        </div>
      )}
    </>
  );
}
