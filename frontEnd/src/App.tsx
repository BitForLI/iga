import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { OrderModeProvider } from './context/OrderModeContext';
import { HomePage } from './pages/HomePage';
import { CartSidebar } from './components/CartSidebar';
import { UserSidebar } from './components/UserSidebar';
import { PickupDeliverySidebar } from './components/PickupDeliverySidebar';
import { Sidebar } from './components/Sidebar';
import { AdminLayout } from './layouts/AdminLayout';
import { StaffLayout } from './layouts/StaffLayout';
import { RequireAdmin, RequireStaffOrAdmin } from './components/BackofficeRouteGuards';
import { ProductManagementPage } from './pages/admin/ProductManagementPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { OrderManagementPage } from './pages/admin/OrderManagementPage';
import { OrderDetailPage } from './pages/admin/OrderDetailPage';
import { CustomerManagementPage } from './pages/admin/CustomerManagementPage';
import { CustomerDetailPage } from './pages/admin/CustomerDetailPage';
import igaLogo from './assets/images/IGA.png';
import { useCart } from './context/CartContext';
import { paymentAPI } from './api';
import { useMaxWidth } from './hooks/useMediaQuery';

const MOBILE_NAV_BREAKPOINT = 768;

function MainAppWithPaymentReturn() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { clear: clearCart } = useCart();

  useEffect(() => {
    const payment = searchParams.get('payment');
    const orderIdRaw = searchParams.get('orderId');
    if (payment === 'cancelled' && orderIdRaw) {
      setSearchParams({}, { replace: true });
      return;
    }
    if (payment !== 'success' || !orderIdRaw) {
      return;
    }

    const orderId = parseInt(orderIdRaw, 10);
    if (Number.isNaN(orderId)) {
      setSearchParams({}, { replace: true });
      return;
    }

    void (async () => {
      try {
        // Stripe Dashboard 已「成功」但本站仍 Pending：多为 Webhook 打不到 localhost；此处用 Session API 主动对齐
        await paymentAPI.syncOrderAfterCheckout(orderId);
      } catch (e) {
        console.error('[payment] 同步订单状态失败（可忽略后由 Webhook 补）：', e);
      } finally {
        clearCart();
        setSearchParams({}, { replace: true });
      }
    })();
  }, [searchParams, setSearchParams, clearCart]);

  return <MainApp />;
}

function MainApp() {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const isNarrow = useMaxWidth(MOBILE_NAV_BREAKPOINT);
  const navRef = useRef<HTMLElement>(null);
  /** 实测顶栏高度（窄屏两行时远大于 72px），供左侧固定栏 top 使用，避免与搜索条重叠 */
  const [navBarHeightPx, setNavBarHeightPx] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= MOBILE_NAV_BREAKPOINT ? 132 : 90));

  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setNavBarHeightPx(Math.max(48, Math.ceil(h)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
    };
  }, [isNarrow]);

  const scrollToSearchResults = () => {
    setTimeout(() => {
      document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Top Navigation Bar */}
      <nav
        ref={navRef}
        style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: isNarrow ? '0.5rem 0.75rem' : '0.75rem 1.5rem',
          minHeight: isNarrow ? undefined : 90,
          display: 'flex',
          flexDirection: isNarrow ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isNarrow ? 'stretch' : 'center',
          gap: isNarrow ? '0.65rem' : '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 120,
        }}
      >
        {/* 第一行：Logo + 右侧图标；宽屏时中间插搜索 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            width: '100%',
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minWidth: 0,
              cursor: 'pointer',
              marginLeft: isNarrow ? 0 : '1rem',
            }}
            onClick={() => {
              setSelectedCategory('');
              setSearchKeyword('');
            }}
          >
            <img
              src={igaLogo}
              alt="IGA"
              style={{ height: isNarrow ? 32 : 48, width: 'auto', objectFit: 'contain' }}
            />
          </div>

          {!isNarrow && (
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                flex: '1 1 auto',
                minWidth: 0,
                maxWidth: 900,
                margin: '0 0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '20px',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={scrollToSearchResults}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                Search
              </button>
              <input
                type="text"
                className="nav-search-input"
                placeholder="I'm shopping for...."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && scrollToSearchResults()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'white',
                  padding: '0.5rem 1rem',
                }}
              />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: isNarrow ? '0.75rem' : '1rem',
              alignItems: 'center',
              flexShrink: 0,
              marginLeft: isNarrow ? 'auto' : undefined,
            }}
          >
            <PickupDeliverySidebar compact={isNarrow} />
            <UserSidebar compact={isNarrow} />
            <CartSidebar compact={isNarrow} />
          </div>
        </div>

        {/* 窄屏：搜索独占一行，宽度随屏宽 */}
        {isNarrow && (
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              width: '100%',
              minWidth: 0,
              border: '1px solid #d1d5db',
              borderRadius: '12px',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={scrollToSearchResults}
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                padding: '0.45rem 0.85rem',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              Search
            </button>
            <input
              type="text"
              className="nav-search-input"
              placeholder="I'm shopping for...."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && scrollToSearchResults()}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                fontSize: '16px',
                outline: 'none',
                boxShadow: 'none',
                backgroundColor: 'white',
                padding: '0.45rem 0.65rem',
              }}
            />
          </div>
        )}
      </nav>

      {/* Main Content Area */}
      <div style={{ display: 'flex', minHeight: `calc(100dvh - ${navBarHeightPx}px)` }}>
        <Sidebar selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} navHeight={navBarHeightPx} />
        <main style={{ flex: 1, padding: isNarrow ? '0.75rem' : '1.5rem', minWidth: 0 }}>
          <HomePage selectedCategory={selectedCategory} searchKeyword={searchKeyword} />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <OrderModeProvider>
        <Routes>
          <Route path="/" element={<MainAppWithPaymentReturn />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="/admin/orders" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="products" element={<ProductManagementPage />} />
            <Route path="orders" element={<OrderManagementPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="customers" element={<CustomerManagementPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
          </Route>
          <Route
            path="/staff"
            element={
              <RequireStaffOrAdmin>
                <StaffLayout />
              </RequireStaffOrAdmin>
            }
          >
            <Route index element={<Navigate to="/staff/orders" replace />} />
            <Route path="orders" element={<OrderManagementPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
          </Route>
        </Routes>
        </OrderModeProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
