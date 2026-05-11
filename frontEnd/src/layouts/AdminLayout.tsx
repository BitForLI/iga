import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, ConfigProvider } from 'antd';
import {
  DollarOutlined,
  ShoppingOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const ADMIN_THEME = {
  token: {
    colorPrimary: '#dc2626',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f3f4f6',
    colorBgElevated: '#ffffff',
    colorText: '#1f2937',
    colorBorder: '#e5e7eb',
    colorSplit: '#e5e7eb',
    borderRadius: 6,
  },
};

/** 管理员：商品、客户；订单在 /staff（员工与管理员均可从账户入口进入） */
const MENU_ITEMS = [
  { key: '/admin/products', icon: <ShoppingOutlined />, label: 'Products' },
  { key: '/admin/refunds', icon: <DollarOutlined />, label: 'Refunds' },
  { key: '/admin/customers', icon: <UserOutlined />, label: 'Customers' },
];

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = MENU_ITEMS.find((m) => location.pathname.startsWith(m.key))?.key ?? '/admin/products';

  return (
    <ConfigProvider theme={ADMIN_THEME}>
      <style>{`
        .admin-layout .ant-menu-dark { background: #374151 !important; }
        .admin-layout .ant-menu-dark .ant-menu-item-selected { background: #dc2626 !important; color: #fff !important; }
        .admin-layout .ant-menu-dark .ant-menu-item:hover { background: #4b5563 !important; }
      `}</style>
      <Layout className="admin-layout" style={{ minHeight: '100vh', background: '#f3f4f6' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={220}
          style={{ background: '#374151' }}
        >
          <div
            style={{
              height: 48,
              margin: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: '#fff',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {collapsed ? 'IGA' : 'IGA Admin'}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={MENU_ITEMS}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, background: 'transparent' }}
          />
        </Sider>
        <Layout style={{ background: '#f3f4f6' }}>
          <Header
            style={{
              padding: '0 16px',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              borderBottom: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            {collapsed ? (
              <MenuUnfoldOutlined style={{ fontSize: 18, cursor: 'pointer', color: '#374151' }} onClick={() => setCollapsed(false)} />
            ) : (
              <MenuFoldOutlined style={{ fontSize: 18, cursor: 'pointer', color: '#374151' }} onClick={() => setCollapsed(true)} />
            )}
            <Link to="/staff/orders" style={{ color: '#6b7280', fontSize: 13 }}>
              订单备货（员工入口）
            </Link>
            <Link to="/" style={{ marginLeft: 'auto', color: '#6b7280' }}>
              Back to store
            </Link>
          </Header>
          <Content style={{ margin: 16, overflow: 'auto', background: '#f3f4f6' }}>
            <div style={{ padding: 24, background: '#ffffff', borderRadius: 8, minHeight: 360, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <Outlet context={{ adminBasePath: '/admin' }} />
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
