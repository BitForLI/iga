import { useState } from 'react';
import { AddressAutofill } from '@mapbox/search-js-react';
import { EnvironmentOutlined, CarOutlined, CloseOutlined } from '@ant-design/icons';
import pickupIcon from '../assets/images/自提点.png';
import { useOrderMode, type OrderType } from '../context/OrderModeContext';

const PICKUP_ADDRESS = 'Beverly Hills IGA';
const PICKUP_ADDRESS_FULL = 'Beverly Hills IGA, Beverly Hills NSW';
const MAP_LINK = 'https://www.google.com/maps/search/Beverly+Hills+IGA+Beverly+Hills+NSW';
// Hurstville 附近，用于 Mapbox 优先推荐悉尼区域地址
const SYDNEY_PROXIMITY = { lng: 151.1, lat: -33.967 };

const PICKUP_SLOT_HOURS = [9, 11, 13, 15, 17, 19];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function generatePickupSlots() {
  const now = new Date();
  const slots: { date: Date; label: string; value: string; disabled: boolean }[] = [];
  for (let i = 0; i < PICKUP_SLOT_HOURS.length; i++) {
    const hour = PICKUP_SLOT_HOURS[i];
    const slotStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0);
    const slotEndHour = i < PICKUP_SLOT_HOURS.length - 1 ? PICKUP_SLOT_HOURS[i + 1] : 21;
    const dateStr = `${slotStart.getMonth() + 1}/${slotStart.getDate()}`;
    const weekday = WEEKDAY[slotStart.getDay()];
    const timeStr = `${hour}:00-${slotEndHour}:00`;
    const disabled = slotStart <= now;
    slots.push({
      date: slotStart,
      label: `${dateStr} ${weekday} ${timeStr}`,
      value: slotStart.toISOString(),
      disabled,
    });
  }
  return slots;
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

export function PickupDeliverySidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [addressInputDirty, setAddressInputDirty] = useState(false);
  const { orderType, setOrderType, pickupTimeSlot, setPickupTimeSlot, deliveryInfo, setDeliveryInfo, saveDeliveryAddress } = useOrderMode();

  const pickupSlots = isOpen ? generatePickupSlots() : [];

  const handleOrderTypeChange = (t: OrderType) => {
    setOrderType(t);
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          title="Pickup / Delivery"
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img src={pickupIcon} alt="Pickup/Delivery" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
        </button>
        <span style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1 }}>
          {orderType === 'Pickup' ? 'Pickup' : 'Delivery'}
        </span>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: '420px',
            maxWidth: '95vw',
            height: '100vh',
            backgroundColor: 'white',
            boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideIn 0.3s ease-out',
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
              onClick={() => setIsOpen(false)}
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
              overflowY: orderType === 'Delivery' ? 'visible' : 'auto',
              overflowX: 'visible',
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {pickupSlots.map((slot) => {
                      const selected = pickupTimeSlot === slot.value;
                      return (
                        <button
                          key={slot.value}
                          type="button"
                          disabled={slot.disabled}
                          onClick={() => !slot.disabled && setPickupTimeSlot(slot.value)}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '12px 16px',
                            border: 'none',
                            borderBottom: selected ? '2px solid #dc2626' : '1px solid #e5e5e5',
                            background: 'white',
                            cursor: slot.disabled ? 'not-allowed' : 'pointer',
                            fontSize: 15,
                            fontWeight: selected ? 600 : 400,
                            color: slot.disabled ? '#9ca3af' : selected ? '#dc2626' : '#0a0a0a',
                            textAlign: 'left',
                            opacity: slot.disabled ? 0.5 : 1,
                          }}
                        >
                          {slot.label}
                        </button>
                      );
                    })}
                  </div>
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
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Add VITE_MAPBOX_ACCESS_TOKEN in .env to enable address search.</p>
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
                  onClick={saveDeliveryAddress}
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

      {/* 背景遮罩 */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 999,
          }}
        />
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
