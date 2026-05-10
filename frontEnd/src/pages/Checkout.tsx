import { useCart } from '../context/CartContext';
import { useState, type FormEvent } from 'react';
import { orderAPI, paymentAPI } from '../api';
import { useAuth } from '../context/AuthContext';

interface UserInfo {
  name: string;
  email: string;
  phoneNumber: string;
}

export function Checkout() {
  const { items, total, clear } = useCart();
  const { user } = useAuth();
  const [userInfo, setUserInfo] = useState<UserInfo>({ name: '', email: '', phoneNumber: '' });
  const [pickupTime, setPickupTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: '#999' }}>Cart is empty, cannot checkout</p>
      </div>
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setUserInfo((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!user) {
      setError('Please sign in before checkout');
      return;
    }
    setLoading(true);

    try {
      // 创建订单
      const orderRes = await orderAPI.create({
        UserId: user.id,
        OrderType: 'Pickup',
        PickupTime: pickupTime,
        Items: items.map((item) => ({
          ProductId: item.productId,
          Quantity: item.quantity,
          ExpectedWeight: item.quantity,
        })),
      });

      const orderId = (orderRes as any).orderId;

      // 创建支付会话，获取 Stripe Checkout URL
      const checkoutRes = (await paymentAPI.createCheckout(orderId)) as { url?: string };
      const stripeUrl = checkoutRes?.url;

      if (stripeUrl) {
        window.location.href = stripeUrl;
      } else {
        setSuccess(true);
        clear();
        setError('Could not get payment link, please try again');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      {success && (
        <div
          style={{
            backgroundColor: '#dcfce7',
            color: '#166534',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          ✅ Order created! Redirecting to payment...
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* 订单摘要 */}
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Order Summary</h2>
          <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
            {items.map((item) => (
              <div
                key={item.productId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingBottom: '0.75rem',
                  borderBottom: '1px solid #e5e7eb',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <p style={{ fontWeight: 'bold' }}>{item.name}</p>
                  <p style={{ fontSize: '0.875rem', color: '#666' }}>{item.quantity}x</p>
                </div>
                <p style={{ fontWeight: 'bold' }}>${(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
            <div
              style={{
                paddingTop: '0.75rem',
                borderTop: '2px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.25rem',
                fontWeight: 'bold',
              }}
            >
              <span>Total:</span>
              <span style={{ color: '#f97316' }}>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* 结账表单 */}
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Checkout Info</h2>

          {error && (
            <div
              style={{
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                padding: '0.75rem',
                borderRadius: '6px',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Name</label>
              <input
                type="text"
                name="name"
                value={userInfo.name}
                onChange={handleInputChange}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Email</label>
              <input
                type="email"
                name="email"
                value={userInfo.email}
                onChange={handleInputChange}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Phone</label>
              <input
                type="tel"
                name="phoneNumber"
                value={userInfo.phoneNumber}
                onChange={handleInputChange}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Pickup time</label>
              <input
                type="datetime-local"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: loading ? '#ccc' : '#f97316',
                color: 'white',
                padding: '1rem',
                borderRadius: '6px',
                border: 'none',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Processing...' : `Pay $${total.toFixed(2)}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
