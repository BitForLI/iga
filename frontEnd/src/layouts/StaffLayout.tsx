import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, ConfigProvider } from 'antd';
import { DollarOutlined, ShoppingCartOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useMaxWidth } from '../hooks/useMediaQuery';

const { Header, Sider, Content } = Layout;

const STAFF_COMPACT_MAX_PX = 992;

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
  const isCompact = useMaxWidth(STAFF_COMPACT_MAX_PX);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = MENU_ITEMS.find((m) => location.pathname.startsWith(m.key))?.key ?? '/staff/orders';

  useEffect(() => {
    if (isCompact) setCollapsed(true);
    else setCollapsed(false);
  }, [isCompact]);

  const drawerOpen = isCompact && !collapsed;

  return (
    <ConfigProvider theme={STAFF_THEME}>
      <style>{`
        .staff-layout .ant-menu-dark { background: #065f46 !important; }
        .staff-layout .ant-menu-dark .ant-menu-item-selected { background: #059669 !important; color: #fff !important; }
        .staff-layout .ant-menu-dark .ant-menu-item:hover { background: #047857 !important; }
        .staff-layout .ant-layout-sider-children { display: flex; flex-direction: column; min-height: 0; }
      `}</style>
      <Layout className="staff-layout" style={{ minHeight: '100vh', background: '#ecfdf5' }}>
        {drawerOpen && (
          <div
            role="presentation"
            aria-hidden
            onClick={() => setCollapsed(true)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0, 0, 0, 0.45)',
            }}
          />
        )}
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={220}
          collapsedWidth={isCompact ? 0 : 72}
          style={{
            background: '#065f46',
            ...(drawerOpen
              ? {
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  zIndex: 1001,
                  height: '100vh',
                  overflowY: 'auto',
                  boxShadow: '4px 0 24px rgba(0, 0, 0, 0.12)',
                }
              : {}),
          }}
        >
          <div
            style={{
              height: 48,
              margin: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed && !isCompact ? 'center' : 'flex-start',
              color: '#fff',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {collapsed && !isCompact ? 'IGA' : 'IGA Prep'}
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={MENU_ITEMS}
            onClick={({ key }) => {
              navigate(key);
              if (isCompact) setCollapsed(true);
            }}
            style={{ flex: 1, background: 'transparent', border: 'none' }}
          />
        </Sider>
        <Layout style={{ background: '#ecfdf5', minWidth: 0, flex: 1 }}>
          <Header
            style={{
              padding: isCompact ? '0 10px' : '0 16px',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              rowGap: 8,
              columnGap: 12,
              borderBottom: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              minWidth: 0,
            }}
          >
            {collapsed ? (
              <MenuUnfoldOutlined
                style={{ fontSize: 18, cursor: 'pointer', color: '#374151', flexShrink: 0 }}
                onClick={() => setCollapsed(false)}
              />
            ) : (
              <MenuFoldOutlined
                style={{ fontSize: 18, cursor: 'pointer', color: '#374151', flexShrink: 0 }}
                onClick={() => setCollapsed(true)}
              />
            )}
            <span style={{ color: '#6b7280', fontSize: 14, whiteSpace: 'nowrap' }}>Staff portal · Orders only</span>
            <Link to="/" style={{ marginLeft: 'auto', color: '#059669', fontSize: 14, whiteSpace: 'nowrap' }}>
              Back to store
            </Link>
          </Header>
          <Content
            style={{
              margin: isCompact ? 8 : 16,
              overflow: 'auto',
              background: '#ecfdf5',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                padding: isCompact ? 12 : 24,
                background: '#ffffff',
                borderRadius: 8,
                minHeight: 360,
                maxWidth: '100%',
                width: '100%',
                boxSizing: 'border-box',
                overflowX: 'auto',
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
