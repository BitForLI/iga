import { useState } from 'react';
import { message } from 'antd';
import { useRightDrawer, DRAWER_MS } from '../hooks/useRightDrawer';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useOrderMode } from '../context/OrderModeContext';
import { orderAPI, paymentAPI, ApiRequestError } from '../api';
import { DELIVERY_SUBURBS } from './PickupDeliverySidebar';
import cartIcon from '../assets/images/cart.png';
import deleteIcon from '../assets/images/删除.png';
import productImage from '../assets/images/main.png';
import { resolveProductImageUrl } from '../utils/imageUrl';

// 配送费：消费越多越便宜，50 以上免运费
function getDeliveryFee(subtotal: number): number {
  if (subtotal >= 50) return 0;
  if (subtotal >= 35) return 3;
  if (subtotal >= 20) return 5;
  return 8;
}

export function CartSidebar({ compact = false }: { compact?: boolean }) {
  const iconPx = compact ? 24 : 32;
  const badgePx = compact ? 17 : 20;
  const { items, totalQuantity, removeItem, updateQuantity, total } = useCart();
  const { user } = useAuth();
  const { orderType, pickupTimeSlot, deliveryInfo } = useOrderMode();
  const deliveryFee = orderType === 'Delivery' ? getDeliveryFee(total) : 0;
  const grandTotal = total + deliveryFee;
  const {
    panelMounted,
    panelEnter,
    closePanel,
    onPanelTransitionEnd,
    toggleFromTrigger,
  } = useRightDrawer();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  return (
    <>
      {/* 购物车按钮 */}
      <button
        type="button"
        onClick={toggleFromTrigger}
        style={{
          position: 'relative',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          width: iconPx,
          height: iconPx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: compact ? 2 : 0,
          flexShrink: 0,
        }}
      >
        <img
          src={cartIcon}
          alt="cart"
          style={{ width: iconPx, height: iconPx, objectFit: 'contain' }}
        />
        {totalQuantity > 0 && (
          <span
            style={{
              position: 'absolute',
              top: compact ? -6 : -8,
              right: compact ? -6 : -8,
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: totalQuantity > 9 ? 9999 : '50%',
              minWidth: badgePx,
              height: badgePx,
              padding: totalQuantity > 9 ? '0 5px' : 0,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? '0.65rem' : '0.75rem',
              fontWeight: 'bold',
            }}
          >
            {totalQuantity > 99 ? '99+' : totalQuantity}
          </span>
        )}
      </button>

      {/* 侧边栏 */}
      {panelMounted && (
        <div
          role="dialog"
          aria-modal="true"
          onTransitionEnd={onPanelTransitionEnd}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: 'min(100vw, 350px)',
            maxWidth: '100%',
            height: '100dvh',
            backgroundColor: 'white',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            transform: panelEnter ? 'translate3d(0,0,0)' : 'translate3d(100%,0,0)',
            transition: `transform ${DRAWER_MS}ms ease-out`,
            willChange: 'transform',
          }}
        >
          {/* 关闭按钮 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Cart</h2>
            <button
              type="button"
              onClick={closePanel}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          {/* 购物车项目列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            {items.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999' }}>Cart is empty</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.productId}
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    padding: '0.75rem 0',
                    borderBottom: '1px solid #f0f0f0',
                    marginBottom: '0.75rem',
                  }}
                >
                  {/* 左侧：商品图 */}
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      flexShrink: 0,
                      borderRadius: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={resolveProductImageUrl(item.imageUrl, productImage)}
                      alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  {/* 右侧：名字 + (价格与加减同行) + 删除在最右 */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <p style={{ fontWeight: 'bold', marginBottom: 0, fontSize: '0.9rem' }}>{item.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 'bold' }}>${item.price.toFixed(2)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: 'white',
                            border: 'none',
                            borderRight: '1px solid #d1d5db',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem',
                            color: '#333',
                          }}
                        >
                          −
                        </button>
                        <span
                          style={{
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: '1px solid #d1d5db',
                            fontWeight: 'bold',
                            fontSize: '0.875rem',
                          }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: 'white',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.25rem',
                            color: '#333',
                          }}
                        >
                          +
                        </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img src={deleteIcon} alt="Remove" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 结账区域 */}
          {items.length > 0 && (
            <div
              style={{
                borderTop: '1px solid #e5e7eb',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {orderType === 'Pickup' ? 'Pickup' : 'Delivery'}
                {orderType === 'Pickup' && !pickupTimeSlot && (
                  <span style={{ color: '#dc2626', marginLeft: 4 }}>(Please select pickup time slot first)</span>
                )}
                {orderType === 'Delivery' && !deliveryInfo.address?.trim() && (
                  <span style={{ color: '#dc2626', marginLeft: 4 }}>(Please enter delivery address first)</span>
                )}
                {orderType === 'Delivery' && !deliveryInfo.suburb && (
                  <span style={{ color: '#dc2626', marginLeft: 4 }}>(Please select delivery suburb)</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                {orderType === 'Delivery' && deliveryFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Delivery fee:</span>
                    <span>${deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {orderType === 'Delivery' && deliveryFee === 0 && total >= 50 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                    <span>Delivery fee:</span>
                    <span>Free delivery</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.125rem', fontWeight: 'bold' }}>
                <span>Total:</span>
                <span style={{ color: '#dc2626', fontWeight: 'bold' }}>${grandTotal.toFixed(2)}</span>
              </div>
              {checkoutError && (
                <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: 0 }}>{checkoutError}</p>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (orderType === 'Pickup' && !pickupTimeSlot) {
                    const msg = 'Please select a pickup time slot in the Pickup/Delivery panel';
                    setCheckoutError(msg);
                    message.warning(msg);
                    return;
                  }
                  if (orderType === 'Delivery' && !deliveryInfo.address?.trim()) {
                    const msg = 'Please enter delivery address in the Pickup/Delivery panel';
                    setCheckoutError(msg);
                    message.warning(msg);
                    return;
                  }
                  if (orderType === 'Delivery' && !DELIVERY_SUBURBS.includes(deliveryInfo.suburb as typeof DELIVERY_SUBURBS[number])) {
                    const msg = 'Please select delivery suburb (Hurstville, Allawah, Carlton, Roseland only)';
                    setCheckoutError(msg);
                    message.warning(msg);
                    return;
                  }
                  if (!user) {
                    const msg = 'Please sign in before checkout';
                    setCheckoutError(msg);
                    message.warning(msg);
                    return;
                  }
                  setCheckoutError('');
                  setCheckoutLoading(true);
                  try {
                    const deliveryAddress = orderType === 'Delivery'
                      ? [deliveryInfo.address, deliveryInfo.suburb, deliveryInfo.postcode].filter(Boolean).join(', ')
                      : undefined;
                    const orderRes = (await orderAPI.create({
                      userId: user.id,
                      orderType: orderType,
                      pickupTime: orderType === 'Pickup' ? pickupTimeSlot : undefined,
                      deliveryAddress: deliveryAddress,
                      deliverySuburb: orderType === 'Delivery' ? deliveryInfo.suburb : undefined,
                      items: items.map((i) => ({
                        productId: i.productId,
                        quantity: i.quantity,
                        expectedWeight: i.quantity,
                      })),
                    })) as { orderId?: number };
                    const orderId = orderRes?.orderId;
                    if (!orderId) throw new Error('Order creation failed');
                    const checkoutRes = (await paymentAPI.createCheckout(orderId)) as { url?: string };
                    const stripeUrl = checkoutRes?.url;
                    if (stripeUrl) {
                      window.location.href = stripeUrl;
                    } else {
                      throw new Error('Could not get payment link');
                    }
                  } catch (err) {
                    const m = err instanceof Error ? err.message : String(err);
                    if (err instanceof ApiRequestError) {
                      console.error(
                        '[checkout] 服务器返回:',
                        err.status,
                        err.apiData,
                        '（控制台里这一行才是原因；上面一长串 axios 堆栈没有说明文字）'
                      );
                    }
                    setCheckoutError(m);
                    message.error(m);
                  } finally {
                    setCheckoutLoading(false);
                  }
                }}
                disabled={checkoutLoading}
                style={{
                  width: '100%',
                  backgroundColor: checkoutLoading ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {checkoutLoading ? 'Redirecting...' : 'Checkout'}
              </button>
            </div>
          )}
        </div>
      )}

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
            zIndex: 1099,
            opacity: panelEnter ? 1 : 0,
            transition: `opacity ${DRAWER_MS}ms ease-out`,
          }}
        />
      )}
    </>
  );
}
