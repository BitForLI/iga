import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api';
import { orderAPI } from '../api';
import userIcon from '../assets/images/user.png';

export function UserSidebar() {
  const { user, setUser, isLoggedIn } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const openSidebar = () => setIsOpen(true);
  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      <button
        onClick={openSidebar}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={userIcon} alt="user" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: '380px',
            maxWidth: '100vw',
            height: '100vh',
            backgroundColor: 'white',
            boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Account</h2>
            <button
              onClick={closeSidebar}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.25rem',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            {isLoggedIn && user ? (
              <OrderHistory user={user} onClose={closeSidebar} />
            ) : (
              <AuthForms tab={tab} setTab={setTab} onSuccess={(u) => { setUser(u); closeSidebar(); }} />
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          onClick={closeSidebar}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 999,
          }}
        />
      )}
    </>
  );
}

function AuthForms({
  tab,
  setTab,
  onSuccess,
}: {
  tab: 'login' | 'register';
  setTab: (t: 'login' | 'register') => void;
  onSuccess: (user: { id: number; name: string; email: string; phoneNumber: string; role?: string }) => void;
}) {
  const [loginData, setLoginData] = useState({ Email: '', Password: '' });
  const [registerData, setRegisterData] = useState({
    Name: '',
    Email: '',
    PhoneNumber: '',
    Password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login(loginData) as any;
      onSuccess({
        id: res.id,
        name: res.name,
        email: res.email,
        phoneNumber: res.phoneNumber || '',
        role: res.role || 'Customer',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.register(registerData) as any;
      onSuccess({
        id: res.userId,
        name: registerData.Name,
        email: registerData.Email,
        phoneNumber: registerData.PhoneNumber,
        role: 'Customer',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => { setTab('login'); setError(''); }}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'login' ? '#dc2626' : '#f3f4f6',
            color: tab === 'login' ? 'white' : '#374151',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => { setTab('register'); setError(''); }}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'register' ? '#dc2626' : '#f3f4f6',
            color: tab === 'register' ? 'white' : '#374151',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Register
        </button>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {tab === 'login' ? (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Email</label>
            <input
              type="email"
              value={loginData.Email}
              onChange={(e) => setLoginData({ ...loginData, Email: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Password</label>
            <input
              type="password"
              value={loginData.Password}
              onChange={(e) => setLoginData({ ...loginData, Password: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: loading ? '#9ca3af' : '#dc2626',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Name</label>
            <input
              type="text"
              value={registerData.Name}
              onChange={(e) => setRegisterData({ ...registerData, Name: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Email</label>
            <input
              type="email"
              value={registerData.Email}
              onChange={(e) => setRegisterData({ ...registerData, Email: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Phone</label>
            <input
              type="tel"
              value={registerData.PhoneNumber}
              onChange={(e) => setRegisterData({ ...registerData, PhoneNumber: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Password</label>
            <input
              type="password"
              value={registerData.Password}
              onChange={(e) => setRegisterData({ ...registerData, Password: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: loading ? '#9ca3af' : '#dc2626',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
      )}
    </div>
  );
}

function OrderHistory({ user, onClose }: { user: { id: number; role?: string }; onClose: () => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { setUser } = useAuth();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await orderAPI.getUserOrders(user.id);
        setOrders(Array.isArray(res) ? res : []);
      } catch (err) {
        setError((err as Error).message);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [user.id]);

  const handleLogout = () => {
    setUser(null);
    onClose();
  };

  if (loading) {
    return <p style={{ textAlign: 'center', color: '#999' }}>Loading orders...</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Order History</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {user?.role === 'Admin' ? (
            <Link
              to="/admin/dashboard"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                border: '1px solid #1890ff',
                color: '#1890ff',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                textDecoration: 'none',
              }}
            >
              Admin
            </Link>
          ) : null}
          {user?.role === 'Staff' ? (
            <Link
              to="/staff/orders"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                border: '1px solid #059669',
                color: '#059669',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                textDecoration: 'none',
              }}
            >
              Prep
            </Link>
          ) : null}
          <button
          onClick={handleLogout}
          style={{
            padding: '0.35rem 0.75rem',
            fontSize: '0.8rem',
            border: '1px solid #dc2626',
            color: '#dc2626',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
        </div>
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>
      )}

      {orders.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', marginTop: '2rem' }}>No orders yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orders.map((order: any) => (
            <div
              key={order.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: '#f9fafb',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Order #{order.id}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: ['Paid', 'Preparing', 'Prepared', 'Completed'].includes(order.orderStatus) ? '#dcfce7' : '#fef3c7',
                    color: ['Paid', 'Preparing', 'Prepared', 'Completed'].includes(order.orderStatus) ? '#166534' : '#92400e',
                  }}
                >
                  {order.orderStatus}
                </span>
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#dc2626' }}>
                ${order.totalAmount ? Number(order.totalAmount).toFixed(2) : '0.00'}
              </div>
              {order.items && order.items.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  {order.items.slice(0, 3).map((item: any, i: number) => (
                    <div key={i}>{item.productName || item.ProductName || 'Item'} x{item.quantity}</div>
                  ))}
                  {order.items.length > 3 && <div>+{order.items.length - 3} more</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
