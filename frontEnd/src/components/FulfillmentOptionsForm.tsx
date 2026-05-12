import { useState, useMemo, useEffect } from 'react';
import { AddressAutofill } from '@mapbox/search-js-react';
import { EnvironmentOutlined, CarOutlined } from '@ant-design/icons';
import { useOrderMode, type OrderType } from '../context/OrderModeContext';

const PICKUP_ADDRESS = 'Beverly Hills IGA';
const PICKUP_ADDRESS_FULL = 'Beverly Hills IGA, Beverly Hills NSW';
const MAP_LINK = 'https://www.google.com/maps/search/Beverly+Hills+IGA+Beverly+Hills+NSW';
const SYDNEY_PROXIMITY = { lng: 151.1, lat: -33.967 };
const SYDNEY_REGION_BBOX = '150.82,-34.18,151.42,-33.72';

const MAPBOX_TOKEN_RAW = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;
const MAPBOX_TOKEN =
  typeof MAPBOX_TOKEN_RAW === 'string' && MAPBOX_TOKEN_RAW.trim() ? MAPBOX_TOKEN_RAW.trim() : undefined;

const MAPBOX_ADDRESS_AUTOFILL_OPTIONS = {
  country: 'AU',
  language: 'en',
  proximity: SYDNEY_PROXIMITY,
  bbox: SYDNEY_REGION_BBOX,
  limit: 8,
  streets: true,
} as const;

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

function pickupWindowEnd(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 20, 0, 0, 0);
}

function pickupWindowStart(now: Date): Date {
  return new Date(now.getTime() + 60 * 60 * 1000);
}

function ceilToNextHour(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
  if (out.getTime() < d.getTime()) {
    out.setHours(out.getHours() + 1);
  }
  return out;
}

function generateAllPickupSlots(now: Date): { label: string; shortLabel: string; value: string; dayKey: string }[] {
  const wStart = pickupWindowStart(now);
  const wEnd = pickupWindowEnd(now);
  if (wStart >= wEnd) return [];
  let t = ceilToNextHour(wStart);
  const fmtStart = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const fmtHm = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const out: { label: string; shortLabel: string; value: string; dayKey: string }[] = [];
  while (t < wEnd) {
    const slotEnd = new Date(t.getTime() + PICKUP_SLOT_MS);
    if (slotEnd > wEnd) break;
    out.push({
      label: `${fmtStart.format(t)} – ${fmtHm.format(slotEnd)}`,
      shortLabel: `${fmtHm.format(t)} – ${fmtHm.format(slotEnd)}`,
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

export const DELIVERY_SUBURBS = ['Hurstville', 'Allawah', 'Carlton', 'Roseland'] as const;

function getSuburbFromFeature(props: {
  context?: { locality?: { name?: string }; place?: { name?: string } };
  place_formatted?: string;
}): string {
  const ctx = props?.context;
  const locality = ctx?.locality?.name?.trim();
  const place = ctx?.place?.name?.trim();
  if (locality) return locality;
  if (place) return place;
  const match = props?.place_formatted?.match(/^([^,]+)/);
  return match ? match[1].trim().split(/\s+/)[0] || '' : '';
}

function parseSuburbFromRetrieveProps(props: Record<string, unknown>): string {
  const level2 = String(props.address_level2 ?? '').trim();
  if (level2) return level2;
  return getSuburbFromFeature(props as Parameters<typeof getSuburbFromFeature>[0]);
}

function isInDeliveryZone(suburb: string): boolean {
  if (!suburb) return false;
  return DELIVERY_SUBURBS.some((s) => s.toLowerCase() === suburb.toLowerCase());
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
  const [slotNow, setSlotNow] = useState(() => new Date());

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

  const handleOrderTypeChange = (t: OrderType) => {
    setOrderType(t);
  };

  const showSidebarActions = variant === 'sidebar' && typeof onSidebarClose === 'function';

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
            {orderType === 'Pickup' && (
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>{PICKUP_ADDRESS_FULL}</p>
            )}
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

      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#6b7280' }}>Or choose another option below:</p>
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
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
            From 1 hour from now (rounded up to the next hour) through tomorrow evening; last slots end by 8:00 PM. One slot per
            hour.
          </p>
          {dayCards.length === 0 || allPickupSlots.length === 0 ? (
            <p style={{ margin: 0, padding: '12px 0', fontSize: 14, color: '#64748b' }}>
              No pickup slots in the current window. Please try again later.
            </p>
          ) : (
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
              {dayCards.map((d) => (
                <optgroup key={d.key} label={`${d.dayTop} · ${d.dayBottom}`}>
                  {allPickupSlots
                    .filter((s) => s.dayKey === d.key)
                    .map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.shortLabel}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
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
          <p style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Check if we deliver to your area</p>
          {MAPBOX_TOKEN ? (
            <>
              <form
                onSubmit={(e) => e.preventDefault()}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.35 }}>
                  Start typing your street address; suggestions appear after 3 or more characters. Pick a result to fill suburb
                  and postcode.
                </p>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    background: 'white',
                  }}
                >
                  <AddressAutofill
                    accessToken={MAPBOX_TOKEN}
                    popoverOptions={{ placement: 'bottom-start', flip: true, offset: 6 }}
                    options={MAPBOX_ADDRESS_AUTOFILL_OPTIONS}
                    onRetrieve={(res) => {
                      const feat = res?.features?.[0];
                      if (!feat?.properties) return;
                      const props = feat.properties as Record<string, unknown>;
                      const suburb = parseSuburbFromRetrieveProps(props);
                      const addr1 = String(props.address_line1 ?? '').trim();
                      const full = String(props.full_address ?? '').trim();
                      const placeName = String(props.place_name ?? '').trim();
                      const address =
                        addr1 ||
                        (full ? full.split(',')[0]?.trim() ?? '' : '') ||
                        (placeName ? placeName.split(',')[0]?.trim() ?? '' : '') ||
                        String(props.address ?? '').trim();
                      const postcode = String(props.postcode ?? '');
                      const line2 = (props.address_line2 as string)?.trim() || '';
                      const unitFromMapbox = line2 && /^(unit|apt|#|no\.?)\s*\d+/i.test(line2) ? line2 : '';
                      const info = {
                        ...deliveryInfo,
                        address,
                        suburb,
                        postcode,
                        unitNumber: unitFromMapbox || deliveryInfo.unitNumber,
                      };
                      setAddressInputDirty(false);
                      if (isInDeliveryZone(suburb)) {
                        setDeliveryInfo(info);
                        setAddressError('');
                      } else {
                        setDeliveryInfo(info);
                        setAddressError(
                          suburb
                            ? `This address (${suburb}) is outside our delivery zone. We only deliver to Hurstville, Allawah, Carlton, Roseland`
                            : 'Unable to verify delivery zone for this address. Please confirm it is within our delivery area'
                        );
                      }
                    }}
                    onSuggestError={(err) => {
                      console.warn('Mapbox suggest error:', err);
                      setAddressError(
                        'Address search failed. Confirm VITE_MAPBOX_ACCESS_TOKEN is set for this build, and in Mapbox token settings allow this website URL (and localhost for dev).'
                      );
                    }}
                  >
                    <input
                      name="address"
                      type="text"
                      autoComplete="street-address"
                      placeholder="Street address (type 3+ characters)…"
                      data-lpignore="true"
                      value={deliveryInfo.address ?? ''}
                      onChange={(e) => {
                        setAddressInputDirty(true);
                        setAddressError('');
                        setDeliveryInfo({ ...deliveryInfo, address: e.target.value });
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
                  </AddressAutofill>
                  <EnvironmentOutlined
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#9ca3af',
                      fontSize: '1rem',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  />
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
                Mapbox address search is not configured. Enter your street and suburb manually (same delivery areas as when
                search is enabled).
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
                      setAddressError('Please choose Hurstville, Allawah, Carlton, or Roseland.');
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
                  {DELIVERY_SUBURBS.map((s) => (
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
