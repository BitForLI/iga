import { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProductList } from './pages/ProductList';
import { CreateOrder } from './pages/CreateOrder';
import { OrderStatus } from './pages/OrderStatus';
import './App.css';

type Page = 'products' | 'order' | 'status';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('products');
  const [orderId, setOrderId] = useState(0);

  const renderPage = () => {
    switch (currentPage) {
      case 'products':
        return <ProductList />;
      case 'order':
        return <CreateOrder />;
      case 'status':
        return <OrderStatus orderId={orderId} />;
      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setCurrentPage('products')}
          className={`px-4 py-2 rounded ${
            currentPage === 'products' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          商品列表
        </button>
        <button
          onClick={() => setCurrentPage('order')}
          className={`px-4 py-2 rounded ${
            currentPage === 'order' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          创建订单
        </button>
        <button
          onClick={() => setCurrentPage('status')}
          className={`px-4 py-2 rounded ${
            currentPage === 'status' ? 'bg-blue-600 text-white' : 'bg-gray-200'
          }`}
        >
          订单状态
        </button>
      </div>

      {currentPage === 'status' && (
        <div className="mb-4 flex gap-2">
          <input
            type="number"
            placeholder="订单ID"
            value={orderId}
            onChange={(e) => setOrderId(parseInt(e.target.value))}
            className="p-2 border rounded"
          />
        </div>
      )}

      {renderPage()}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
