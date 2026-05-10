import { useState, useEffect, type FormEvent } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useRightDrawer, DRAWER_MS } from '../hooks/useRightDrawer';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api';
import { orderAPI } from '../api';
import userIcon from '../assets/images/user.png';

export function UserSidebar({ compact = false }: { compact?: boolean }) {
  const iconPx = compact ? 24 : 32;
  const { user, setUser, isLoggedIn } = useAuth();
  const {
    panelMounted,
    panelEnter,
    closePanel,
    onPanelTransitionEnd,
    toggleFromTrigger,
  } = useRightDrawer();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  return (
    <>
      <button
        type="button"
        onClick={toggleFromTrigger}
        style={{
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
        <img src={userIcon} alt="user" style={{ width: iconPx, height: iconPx, objectFit: 'contain' }} />
      </button>

      {panelMounted && (
        <div
          onTransitionEnd={onPanelTransitionEnd}
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: 'min(380px, 100vw)',
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
              type="button"
              onClick={closePanel}
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
              <OrderHistory user={user} onClose={closePanel} />
            ) : (
              <AuthForms tab={tab} setTab={setTab} onSuccess={(u) => { setUser(u); closePanel(); }} />
            )}
          </div>
        </div>
      )}

      {panelMounted && (
        <div
          aria-hidden
          onClick={closePanel}
          style={{
            position: 'fixed',
            inset: 0,
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
    Password: '',
  });
  const [registerStep, setRegisterStep] = useState<'form' | 'verify'>('form');
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.login({
        email: loginData.Email,
        password: loginData.Password,
      }) as any;
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
      await authAPI.register({
        name: registerData.Name,
        email: registerData.Email,
        password: registerData.Password,
      });
      setRegisterStep('verify');
      setVerifyCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.verifyEmail({ email: registerData.Email, code: verifyCode.trim() });
      const res = (await authAPI.login({
        email: registerData.Email,
        password: registerData.Password,
      })) as any;
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

  const handleResendCode = async () => {
    setError('');
    setLoading(true);
    try {
      await authAPI.resendVerification({ email: registerData.Email });
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
          onClick={() => { setTab('login'); setError(''); setRegisterStep('form'); }}
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
          onClick={() => { setTab('register'); setError(''); setRegisterStep('form'); }}
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
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showLoginPassword ? 'text' : 'password'}
                value={loginData.Password}
                onChange={(e) => setLoginData({ ...loginData, Password: e.target.value })}
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '0.5rem 2.25rem 0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showLoginPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowLoginPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '0.35rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showLoginPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </button>
            </div>
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
      ) : registerStep === 'verify' ? (
        <form onSubmit={handleVerifyEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
            Enter the 6-digit code sent to <strong>{registerData.Email}</strong>
          </p>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', letterSpacing: '0.2em', textAlign: 'center' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || verifyCode.length !== 6}
            style={{
              backgroundColor: loading || verifyCode.length !== 6 ? '#9ca3af' : '#dc2626',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 'bold',
              cursor: loading || verifyCode.length !== 6 ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Verifying...' : 'Verify & sign in'}
          </button>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading}
            style={{
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => { setRegisterStep('form'); setError(''); }}
            style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            Back
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
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Password</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showRegisterPassword ? 'text' : 'password'}
                value={registerData.Password}
                onChange={(e) => setRegisterData({ ...registerData, Password: e.target.value })}
                required
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '0.5rem 2.25rem 0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showRegisterPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowRegisterPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '0.35rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showRegisterPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              </button>
            </div>
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
            {loading ? 'Sending...' : 'Send verification code'}
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
            <>
              <Link
                to="/admin/products"
                title="商品、客户、数据看板"
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  border: '1px solid #dc2626',
                  color: '#dc2626',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  textDecoration: 'none',
                }}
              >
                商品后台
              </Link>
              <Link
                to="/staff/orders"
                title="查看与处理订单（与员工同一界面）"
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
                订单备货
              </Link>
            </>
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
              订单备货
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
