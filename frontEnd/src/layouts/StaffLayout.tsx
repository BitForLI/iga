import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, ConfigProvider } from 'antd';
import { DollarOutlined, ShoppingCartOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const STAFF_THEME = {
  token: {
    colorPrimary: '#059669',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#ecfdf5',
    colorBgElevated: '#ffffff',
    colorText: '#1f2937',
    colorBorder: '#e5e7eb',
    colorSplit: '#e5e7eb',
    borderRadius: 6,
  },
};

const MENU_ITEMS = [
  { key: '/staff/orders', icon: <ShoppingCartOutlined />, label: 'Orders' },
  { key: '/staff/refunds', icon: <DollarOutlined />, label: 'Refunds' },
];

/** 员工：仅订单备货，与 /admin 分离 */
export function StaffLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = MENU_ITEMS.find((m) => location.pathname.startsWith(m.key))?.key ?? '/staff/orders';

  return (
    <ConfigProvider theme={STAFF_THEME}>
      <style>{`
        .staff-layout .ant-menu-dark { background: #065f46 !important; }
        .staff-layout .ant-menu-dark .ant-menu-item-selected { background: #059669 !important; color: #fff !important; }
        .staff-layout .ant-menu-dark .ant-menu-item:hover { background: #047857 !important; }
      `}</style>
      <Layout className="staff-layout" style={{ minHeight: '100vh', background: '#ecfdf5' }}>
        <Sider trigger={null} collapsible collapsed={collapsed} width={220} style={{ background: '#065f46' }}>
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
            {collapsed ? 'IGA' : 'IGA Prep'}
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
        <Layout style={{ background: '#ecfdf5' }}>
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
            <span style={{ color: '#6b7280', fontSize: 14 }}>Staff portal · Orders only</span>
            <Link to="/" style={{ marginLeft: 'auto', color: '#059669' }}>
              Back to store
            </Link>
          </Header>
          <Content style={{ margin: 16, overflow: 'auto', background: '#ecfdf5' }}>
            <div
              style={{
                padding: 24,
                background: '#ffffff',
                borderRadius: 8,
                minHeight: 360,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <Outlet context={{ adminBasePath: '/staff' }} />
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
