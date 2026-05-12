import { useState, useMemo, useEffect } from 'react';
import { AddressAutofill } from '@mapbox/search-js-react';
import { useRightDrawer, DRAWER_MS } from '../hooks/useRightDrawer';
import { EnvironmentOutlined, CarOutlined, CloseOutlined } from '@ant-design/icons';
import pickupIcon from '../assets/images/自提点.png';
import { useOrderMode, type OrderType } from '../context/OrderModeContext';

const PICKUP_ADDRESS = 'Beverly Hills IGA';
const PICKUP_ADDRESS_FULL = 'Beverly Hills IGA, Beverly Hills NSW';
const MAP_LINK = 'https://www.google.com/maps/search/Beverly+Hills+IGA+Beverly+Hills+NSW';
// Hurstville 附近，用于 Mapbox 优先推荐悉尼区域地址
const SYDNEY_PROXIMITY = { lng: 151.1, lat: -33.967 };

/** 自取可选：当前时间起满 1 小时后对齐到下一整点起，至次日 20:00 前；每 1 小时一档 */
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

/** 不早于 d 的下一个整点（本地时间），用于整点起算每小时一档 */
function ceilToNextHour(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
  if (out.getTime() < d.getTime()) {
    out.setHours(out.getHours() + 1);
  }
  return out;
}

function generateAllPickupSlots(now: Date): { label: string; value: string; dayKey: string }[] {
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
  const out: { label: string; value: string; dayKey: string }[] = [];
  while (t < wEnd) {
    const slotEnd = new Date(t.getTime() + PICKUP_SLOT_MS);
    if (slotEnd > wEnd) break;
    out.push({
      label: `${fmtStart.format(t)} – ${fmtHm.format(slotEnd)}`,
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

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

function getSuburbFromFeature(props: { context?: { locality?: { name?: string }; place?: { name?: string } }; place_formatted?: string }): string {
  const ctx = props?.context;
  const locality = ctx?.locality?.name?.trim();
  const place = ctx?.place?.name?.trim();
  if (locality) return locality;
  if (place) return place;
  // place_formatted 格式如 "Hurstville NSW 2220, Australia"，尝试提取首个词
  const match = props?.place_formatted?.match(/^([^,]+)/);
  return match ? match[1].trim().split(/\s+/)[0] || '' : '';
}

function isInDeliveryZone(suburb: string): boolean {
  if (!suburb) return false;
  return DELIVERY_SUBURBS.some((s) => s.toLowerCase() === suburb.toLowerCase());
}

export function PickupDeliverySidebar({ compact = false }: { compact?: boolean }) {
  const iconPx = compact ? 24 : 32;
  const {
    panelMounted,
    panelEnter,
    closePanel,
    onPanelTransitionEnd,
    toggleFromTrigger,
  } = useRightDrawer();
  const [addressError, setAddressError] = useState('');
  const [addressInputDirty, setAddressInputDirty] = useState(false);
  const { orderType, setOrderType, pickupTimeSlot, setPickupTimeSlot, deliveryInfo, setDeliveryInfo, saveDeliveryAddress } = useOrderMode();
  const [slotNow, setSlotNow] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState('');
  useEffect(() => {
    if (panelMounted) setSlotNow(new Date());
  }, [panelMounted]);

  const dayCards = useMemo(() => {
    if (!panelMounted) return [];
    return generateDayCardsForPickup(slotNow);
  }, [panelMounted, slotNow]);

  useEffect(() => {
    if (!panelMounted) return;
    if (dayCards.length === 0) {
      setSelectedDayKey('');
      return;
    }
    const fromSlot = pickupTimeSlot ? dateKey(new Date(pickupTimeSlot)) : '';
    if (fromSlot && dayCards.some((d) => d.key === fromSlot)) {
      setSelectedDayKey(fromSlot);
      return;
    }
    setSelectedDayKey((prev) => {
      if (prev && dayCards.some((d) => d.key === prev)) return prev;
      return dayCards[0].key;
    });
  }, [panelMounted, dayCards, pickupTimeSlot]);

  const slotsForDay = useMemo(() => {
    if (!panelMounted || !selectedDayKey) return [];
    return generateAllPickupSlots(slotNow)
      .filter((s) => s.dayKey === selectedDayKey)
      .map(({ label, value }) => ({ label, value }));
  }, [panelMounted, selectedDayKey, slotNow]);

  const handleOrderTypeChange = (t: OrderType) => {
    setOrderType(t);
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: compact ? 0 : 6 }}>
        <button
          onClick={toggleFromTrigger}
          title="Pickup / Delivery"
          type="button"
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: compact ? 2 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: iconPx,
            minHeight: iconPx,
          }}
        >
          <img
            src={pickupIcon}
            alt="Pickup/Delivery"
            style={{ width: iconPx, height: iconPx, objectFit: 'contain', display: 'block' }}
          />
        </button>
        {!compact && (
          <span style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {orderType === 'Pickup' ? 'Pickup' : 'Delivery'}
          </span>
        )}
      </div>

      {panelMounted && (
        <div
          onTransitionEnd={onPanelTransitionEnd}
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: 'min(420px, 100vw)',
            maxWidth: '100%',
            height: '100dvh',
            backgroundColor: 'white',
            boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            transform: panelEnter ? 'translate3d(0,0,0)' : 'translate3d(100%,0,0)',
            transition: `transform ${DRAWER_MS}ms ease-out`,
            willChange: 'transform',
          }}
        >
          {/* 顶部标题栏 - 白底 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.25rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, color: '#0a0a0a' }}>Where would you like to shop?</h2>
            <button
              type="button"
              onClick={closePanel}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseOutlined style={{ fontSize: '1.25rem' }} />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '1rem 1.25rem',
            }}
          >
            {/* 当前门店信息 - 类似 "Delivery from:" / "Pickup from:" */}
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
                    {orderType === 'Pickup' ? PICKUP_ADDRESS : deliveryInfo.suburb ? `${deliveryInfo.address}, ${deliveryInfo.suburb}` : 'Please enter delivery address'}
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

            {/* Tab 导航 */}
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
              <>
                <div>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#0a0a0a' }}>Select pickup time slot</p>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
                    From 1 hour from now (rounded up to the next hour) through tomorrow evening; last slots end by 8:00 PM. One slot per hour.
                  </p>
                  <div style={{ marginBottom: '0.75rem' }}>
                    {dayCards.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>No pickup days available in this window.</p>
                    ) : (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                        paddingBottom: 4,
                        scrollbarWidth: 'thin',
                        WebkitOverflowScrolling: 'touch',
                      }}
                    >
                      {dayCards.map((d) => {
                        const selected = selectedDayKey === d.key;
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => {
                              setSelectedDayKey(d.key);
                              if (pickupTimeSlot) {
                                const sk = dateKey(new Date(pickupTimeSlot));
                                if (sk !== d.key) setPickupTimeSlot('');
                              }
                            }}
                            style={{
                              flex: '0 0 auto',
                              minWidth: 88,
                              padding: '10px 12px',
                              borderRadius: 14,
                              border: selected ? '2px solid #dc2626' : '1px solid #e5e7eb',
                              background: 'white',
                              color: selected ? '#dc2626' : '#0a0a0a',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              textAlign: 'center',
                              lineHeight: 1.25,
                              boxSizing: 'border-box',
                            }}
                          >
                            <div>{d.dayTop}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{d.dayBottom}</div>
                          </button>
                        );
                      })}
                    </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {slotsForDay.length === 0 ? (
                      <p style={{ margin: 0, padding: '12px 0', fontSize: 14, color: '#64748b' }}>
                        No pickup slots in the current window. Please try again later.
                      </p>
                    ) : (
                      slotsForDay.map((slot) => {
                        const selected = pickupTimeSlot === slot.value;
                        return (
                          <button
                            key={slot.value}
                            type="button"
                            onClick={() => setPickupTimeSlot(slot.value)}
                            style={{
                              display: 'block',
                              width: '100%',
                              padding: '12px 16px',
                              border: 'none',
                              borderBottom: selected ? '2px solid #dc2626' : '1px solid #e5e5e5',
                              background: 'white',
                              cursor: 'pointer',
                              fontSize: 15,
                              fontWeight: selected ? 600 : 400,
                              color: selected ? '#dc2626' : '#0a0a0a',
                              textAlign: 'left',
                            }}
                          >
                            {slot.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!pickupTimeSlot}
                    onClick={closePanel}
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
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* 联系名字和联系电话在最上面 */}
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
                      <AddressAutofill
                        accessToken={MAPBOX_TOKEN}
                        onChange={() => {
                          setAddressInputDirty(true);
                          setAddressError('');
                        }}
                        options={{
                          country: 'AU',
                          language: 'en',
                          proximity: SYDNEY_PROXIMITY,
                          limit: 5,
                        }}
                        onRetrieve={(res) => {
                          const feat = res?.features?.[0];
                          if (!feat?.properties) return;
                          const props = feat.properties as Record<string, unknown>;
                          const suburb = String(props.address_level2 ?? getSuburbFromFeature(props as Parameters<typeof getSuburbFromFeature>[0]) ?? '').trim();
                          const address = String(props.address_line1 || props.full_address || props.address || '');
                          const postcode = String(props.postcode ?? '');
                          const line2 = (props.address_line2 as string)?.trim() || '';
                          const unitFromMapbox = line2 && /^(unit|apt|#|no\.?)\s*\d+/i.test(line2) ? line2 : '';
                          const info = { ...deliveryInfo, address, suburb, postcode, unitNumber: unitFromMapbox || deliveryInfo.unitNumber };
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
                          setAddressError('Address search unavailable.');
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, padding: '0 0.75rem', background: 'white' }}>
                          <EnvironmentOutlined style={{ color: '#9ca3af', fontSize: '1rem' }} />
                          <input
                            name="address"
                            type="text"
                            autoComplete="address-line1"
                            placeholder="Start typing your address..."
                            data-lpignore="true"
                            style={{
                              flex: 1,
                              padding: '0.5rem 0',
                              border: 'none',
                              fontSize: '0.875rem',
                              outline: 'none',
                              background: 'transparent',
                            }}
                          />
                        </div>
                      </AddressAutofill>
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
                    {addressError && (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>{addressError}</p>
                    )}
                    {!addressError && !addressInputDirty && deliveryInfo.suburb && (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#16a34a' }}>
                        ✓ Within delivery zone ({deliveryInfo.suburb})
                      </p>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: 6, lineHeight: 1.4 }}>
                      Mapbox address search is not configured. Enter your street and suburb manually (same delivery areas as when search is enabled).
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
                    {addressError ? (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>{addressError}</p>
                    ) : null}
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
                <button
                  type="button"
                  onClick={() => {
                    saveDeliveryAddress();
                    closePanel();
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* 背景遮罩：与侧栏同步淡入淡出 */}
      {panelMounted && (
        <div
          aria-hidden
          onClick={closePanel}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 999,
            opacity: panelEnter ? 1 : 0,
            transition: `opacity ${DRAWER_MS}ms ease-out`,
          }}
        />
      )}
    </>
  );
}
