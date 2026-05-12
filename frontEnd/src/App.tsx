import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams, useParams } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { OrderModeProvider } from './context/OrderModeContext';
import { StorePublicSettingsProvider } from './context/StorePublicSettingsContext';
import { HomePage } from './pages/HomePage';
import { CartSidebar } from './components/CartSidebar';
import { UserSidebar } from './components/UserSidebar';
import { PickupDeliverySidebar } from './components/PickupDeliverySidebar';
import { ContactService } from './components/ContactService';
import { AdminLayout } from './layouts/AdminLayout';
import { StaffLayout } from './layouts/StaffLayout';
import { RequireAdmin, RequireStaffOrAdmin } from './components/BackofficeRouteGuards';
import { ProductManagementPage } from './pages/admin/ProductManagementPage';
import { OrderManagementPage } from './pages/admin/OrderManagementPage';
import { OrderDetailPage } from './pages/admin/OrderDetailPage';
import { CustomerManagementPage } from './pages/admin/CustomerManagementPage';
import { CustomerDetailPage } from './pages/admin/CustomerDetailPage';
import { DeliveryFeesSettingsPage } from './pages/admin/DeliveryFeesSettingsPage';
import { HomeHeroSettingsPage } from './pages/admin/HomeHeroSettingsPage';
import searchIcon from './assets/images/搜索.png';
import { useCart } from './context/CartContext';
import { paymentAPI } from './api';
import { useMaxWidth } from './hooks/useMediaQuery';
import { MOBILE_NAV_BREAKPOINT } from './constants/layout';

/** 旧书签 /admin/orders/:id → 员工订单详情 */
function RedirectAdminOrderToStaff() {
  const { id } = useParams();
  return <Navigate to={`/staff/orders/${id ?? ''}`} replace />;
}

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
  /** 顶栏高度（主区 min-height 等） */
  const [navBarHeightPx, setNavBarHeightPx] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= MOBILE_NAV_BREAKPOINT ? 56 : 90));

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
          padding: isNarrow ? '0.45rem 0.6rem' : '0.75rem 1.5rem',
          minHeight: isNarrow ? undefined : 90,
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isNarrow ? '0.35rem' : '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 120,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: isNarrow ? '0.75rem' : '2rem',
            flex: 1,
            minWidth: 0,
          }}
        >
          {!isNarrow && (
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                justifyContent: 'flex-start',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: 'min(900px, 100%)',
                  minWidth: 280,
                  border: '1px solid #d1d5db',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  backgroundColor: 'white',
                }}
              >
              <button
                type="button"
                onClick={scrollToSearchResults}
                aria-label="Search"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: '0.45rem 0.35rem 0.45rem 0.85rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <img src={searchIcon} alt="" style={{ width: 20, height: 20, objectFit: 'contain', display: 'block' }} />
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
                  padding: '0.5rem 1rem 0.5rem 0',
                }}
              />
              </div>
            </div>
          )}

          {isNarrow && (
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                justifyContent: 'flex-start',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  maxWidth: 'min(560px, calc(100vw - 7rem))',
                  minWidth: 0,
                  border: '1px solid #d1d5db',
                  borderRadius: 10,
                  overflow: 'hidden',
                  backgroundColor: 'white',
                }}
              >
              <button
                type="button"
                onClick={scrollToSearchResults}
                aria-label="Search"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  padding: '0.28rem 0.3rem 0.28rem 0.5rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <img src={searchIcon} alt="" style={{ width: 18, height: 18, objectFit: 'contain', display: 'block' }} />
              </button>
              <input
                type="text"
                className="nav-search-input"
                placeholder="Search…"
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
                  padding: '0.32rem 0.55rem 0.32rem 0',
                }}
              />
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: isNarrow ? '0.5rem' : '1rem',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <PickupDeliverySidebar compact={isNarrow} />
            <UserSidebar compact={isNarrow} />
            <CartSidebar compact={isNarrow} />
          </div>
        </div>
      </nav>

      <main
        style={{
          minHeight: `calc(100dvh - ${navBarHeightPx}px)`,
          padding: isNarrow ? '0.75rem' : '1.5rem',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <HomePage
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          searchKeyword={searchKeyword}
        />
      </main>
      <ContactService />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <OrderModeProvider>
        <Routes>
          <Route
            path="/"
            element={
              <StorePublicSettingsProvider>
                <MainAppWithPaymentReturn />
              </StorePublicSettingsProvider>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="/admin/products" replace />} />
            <Route path="orders" element={<Navigate to="/staff/orders" replace />} />
            <Route path="orders/:id" element={<RedirectAdminOrderToStaff />} />
            <Route path="dashboard" element={<Navigate to="/admin/products" replace />} />
            <Route path="products" element={<ProductManagementPage />} />
            <Route path="store/delivery-fees" element={<DeliveryFeesSettingsPage />} />
            <Route path="store/home-hero" element={<HomeHeroSettingsPage />} />
            <Route path="refunds" element={<OrderManagementPage initialTab="RefundRequested" />} />
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
            <Route
              path="orders"
              element={
                <OrderManagementPage
                  initialTab="Paid"
                  visibleTabKeys={['Paid', 'Preparing', 'PreparedPickup', 'PreparedDelivery', 'RefundRequested']}
                />
              }
            />
            <Route
              path="refunds"
              element={
                <OrderManagementPage
                  initialTab="RefundRequested"
                  visibleTabKeys={['Paid', 'Preparing', 'PreparedPickup', 'PreparedDelivery', 'RefundRequested']}
                />
              }
            />
            <Route path="orders/:id" element={<OrderDetailPage />} />
          </Route>
        </Routes>
        </OrderModeProvider>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
