import { useState, useEffect } from 'react';
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

  const NAV_HEIGHT = 90;

  const scrollToSearchResults = () => {
    setTimeout(() => {
      document.getElementById('search-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Top Navigation Bar */}
      <nav
        style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          padding: '0.75rem 1.5rem',
          minHeight: NAV_HEIGHT,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        {/* Logo Section */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 'fit-content', cursor: 'pointer', marginLeft: '2rem' }}
          onClick={() => {
            setSelectedCategory('');
            setSearchKeyword('');
          }}
        >
          <img src={igaLogo} alt="IGA" style={{ height: '48px', width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Search Bar - 左侧红底白字 Search，右侧输入框 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            width: '900px',
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
              border: 'none',
              fontSize: '0.875rem',
              outline: 'none',
              boxShadow: 'none',
              backgroundColor: 'white',
              padding: '0.5rem 1rem',
            }}
          />
        </div>

        {/* Right Side Icons */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', minWidth: 'fit-content', flexShrink: 0 }}>
          <PickupDeliverySidebar />
          <UserSidebar />
          <CartSidebar />
        </div>
      </nav>

      {/* Main Content Area */}
      <div style={{ display: 'flex', minHeight: `calc(100vh - ${NAV_HEIGHT}px)` }}>
        <Sidebar selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} navHeight={NAV_HEIGHT} />
        <main style={{ flex: 1, padding: '1.5rem' }}>
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
