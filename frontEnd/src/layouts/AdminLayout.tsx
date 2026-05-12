import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, ConfigProvider } from 'antd';
import {
  DollarOutlined,
  ShoppingOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CarOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { useMaxWidth } from '../hooks/useMediaQuery';

const { Header, Sider, Content } = Layout;

/** 平板竖屏及以下：侧栏改为抽屉式，避免与主内容抢宽度 */
const ADMIN_COMPACT_MAX_PX = 992;

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
  { key: '/admin/store/delivery-fees', icon: <CarOutlined />, label: '分区运费' },
  { key: '/admin/store/home-hero', icon: <PictureOutlined />, label: '首页轮播图' },
  { key: '/admin/refunds', icon: <DollarOutlined />, label: 'Refunds' },
  { key: '/admin/customers', icon: <UserOutlined />, label: 'Customers' },
];

export function AdminLayout() {
  const isCompact = useMaxWidth(ADMIN_COMPACT_MAX_PX);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey =
    MENU_ITEMS.find((m) => location.pathname === m.key || location.pathname.startsWith(`${m.key}/`))?.key ??
    '/admin/products';

  useEffect(() => {
    if (isCompact) setCollapsed(true);
    else setCollapsed(false);
  }, [isCompact]);

  const drawerOpen = isCompact && !collapsed;

  return (
    <ConfigProvider theme={ADMIN_THEME}>
      <style>{`
        .admin-layout .ant-menu-dark { background: #374151 !important; }
        .admin-layout .ant-menu-dark .ant-menu-item-selected { background: #dc2626 !important; color: #fff !important; }
        .admin-layout .ant-menu-dark .ant-menu-item:hover { background: #4b5563 !important; }
        .admin-layout .ant-layout-sider-children { display: flex; flex-direction: column; min-height: 0; }
      `}</style>
      <Layout className="admin-layout" style={{ minHeight: '100vh', background: '#f3f4f6' }}>
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
            background: '#374151',
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
            {collapsed && !isCompact ? 'IGA' : 'IGA Admin'}
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
        <Layout style={{ background: '#f3f4f6', minWidth: 0, flex: 1 }}>
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
            <Link to="/staff/orders" style={{ color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
              Orders (staff)
            </Link>
            <Link to="/" style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
              Back to store
            </Link>
          </Header>
          <Content
            style={{
              margin: isCompact ? 8 : 16,
              overflow: 'auto',
              background: '#f3f4f6',
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
              <Outlet context={{ adminBasePath: '/admin' }} />
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
