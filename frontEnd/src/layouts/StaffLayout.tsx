import { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, ConfigProvider } from 'antd';
import type { MenuProps } from 'antd';
import { DollarOutlined, ShoppingCartOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useMaxWidth } from '../hooks/useMediaQuery';

const { Header, Sider, Content } = Layout;

const STAFF_COMPACT_MAX_PX = 992;

/** Orders 子菜单路径（须与 App.tsx 路由一致） */
const STAFF_ORDER_SUBMENU_KEY = 'staff-orders-submenu';

const STAFF_ORDER_LEAF_PATHS = [
  '/staff/orders/to-accept',
  '/staff/orders/preparing',
  '/staff/orders/pickup',
  '/staff/orders/delivery',
  '/staff/orders/completed-pickup',
  '/staff/orders/completed-delivery',
] as const;

const STAFF_THEME = {
  token: {
    colorPrimary: '#059669',
    colorBgContainer: '#ffffff',
    /** 主区灰绿加深，与白卡片对比更强，强光下仍易区分 */
    colorBgLayout: '#c9d4cf',
    colorBgElevated: '#ffffff',
    colorText: '#0f172a',
    colorBorder: '#cbd5e1',
    colorSplit: '#cbd5e1',
    borderRadius: 6,
  },
};

/** 深绿侧栏 + 浅字，户外可读性优于浅灰底弱对比 */
const STAFF_SIDER_BG = '#064e3b';
const STAFF_OVERLAY = 'rgba(15, 23, 42, 0.42)';

const STAFF_MENU_ITEMS: MenuProps['items'] = [
  {
    key: STAFF_ORDER_SUBMENU_KEY,
    icon: <ShoppingCartOutlined />,
    label: 'Orders',
    children: [
      { key: '/staff/orders/to-accept', label: 'To accept' },
      { key: '/staff/orders/preparing', label: 'Preparing' },
      { key: '/staff/orders/pickup', label: 'Pickup' },
      { key: '/staff/orders/delivery', label: 'Delivery' },
      { key: '/staff/orders/completed-pickup', label: 'Completed (pickup)' },
      { key: '/staff/orders/completed-delivery', label: 'Completed (delivery)' },
    ],
  },
  { key: '/staff/refunds', icon: <DollarOutlined />, label: 'Refunds' },
];

function staffMenuSelectedKeys(pathname: string): string[] {
  if ((STAFF_ORDER_LEAF_PATHS as readonly string[]).includes(pathname)) return [pathname];
  if (/^\/staff\/orders\/\d+$/.test(pathname)) return [];
  if (pathname.startsWith('/staff/refunds')) return ['/staff/refunds'];
  return ['/staff/orders/to-accept'];
}

/** 员工：仅订单备货，与 /admin 分离 */
export function StaffLayout() {
  const isCompact = useMaxWidth(STAFF_COMPACT_MAX_PX);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKeys = useMemo(() => staffMenuSelectedKeys(location.pathname), [location.pathname]);
  const [openKeys, setOpenKeys] = useState<string[]>([STAFF_ORDER_SUBMENU_KEY]);

  useEffect(() => {
    if (isCompact) setCollapsed(true);
    else setCollapsed(false);
  }, [isCompact]);

  useEffect(() => {
    if (location.pathname.startsWith('/staff/orders')) {
      setOpenKeys((prev) => (prev.includes(STAFF_ORDER_SUBMENU_KEY) ? prev : [...prev, STAFF_ORDER_SUBMENU_KEY]));
    }
  }, [location.pathname]);

  const drawerOpen = isCompact && !collapsed;

  return (
    <ConfigProvider theme={STAFF_THEME}>
      <style>{`
        .staff-layout .ant-layout-sider-children { display: flex; flex-direction: column; min-height: 0; }
        .staff-layout .staff-sider-menu.ant-menu-dark {
          background: transparent !important;
          color: #e2e8f0 !important;
          border-inline-end: none !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-item,
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-submenu-title {
          color: #f1f5f9 !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-item-selected {
          background: #047857 !important;
          color: #ecfdf5 !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-item:hover,
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-submenu-title:hover {
          background: rgba(16, 185, 129, 0.22) !important;
          color: #ffffff !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-submenu-selected > .ant-menu-submenu-title {
          color: #a7f3d0 !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-submenu-arrow { color: #94a3b8 !important; }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-item .anticon,
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-submenu-title .anticon {
          color: #cbd5e1 !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-item-selected .anticon {
          color: #ecfdf5 !important;
        }
        /* Orders 子菜单内联区：与侧栏同色绿底，白字加粗 */
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-sub.ant-menu-inline {
          background: #064e3b !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-sub.ant-menu-inline > .ant-menu-item {
          color: #ffffff !important;
          font-weight: 700 !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-sub.ant-menu-inline > .ant-menu-item:hover {
          background: rgba(16, 185, 129, 0.22) !important;
          color: #ffffff !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-sub.ant-menu-inline > .ant-menu-item-selected {
          background: #047857 !important;
          color: #ecfdf5 !important;
          font-weight: 700 !important;
        }
        .staff-layout .staff-sider-menu.ant-menu-dark .ant-menu-sub.ant-menu-inline > .ant-menu-item-selected .anticon {
          color: #ecfdf5 !important;
        }
      `}</style>
      <Layout className="staff-layout" style={{ minHeight: '100vh', background: '#c9d4cf' }}>
        {drawerOpen && (
          <div
            role="presentation"
            aria-hidden
            onClick={() => setCollapsed(true)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: STAFF_OVERLAY,
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
            background: STAFF_SIDER_BG,
            borderRight: '1px solid #042f24',
            ...(drawerOpen
              ? {
                  position: 'fixed',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  zIndex: 1001,
                  height: '100vh',
                  overflowY: 'auto',
                  boxShadow: '4px 0 24px rgba(0, 0, 0, 0.2)',
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
              color: '#ecfdf5',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {collapsed && !isCompact ? 'IGA' : 'IGA Prep'}
          </div>
          <Menu
            className="staff-sider-menu"
            theme="dark"
            mode="inline"
            selectedKeys={selectedKeys}
            openKeys={openKeys}
            onOpenChange={setOpenKeys}
            items={STAFF_MENU_ITEMS}
            onClick={({ key }) => {
              if (!key.startsWith('/')) return;
              navigate(key);
              if (isCompact) setCollapsed(true);
            }}
            style={{ flex: 1, background: 'transparent', border: 'none' }}
          />
        </Sider>
        <Layout style={{ background: '#c9d4cf', minWidth: 0, flex: 1 }}>
          <Header
            style={{
              padding: isCompact ? '0 10px' : '0 16px',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              rowGap: 8,
              columnGap: 12,
              borderBottom: '1px solid #94a3b8',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
              minWidth: 0,
            }}
          >
            {collapsed ? (
              <MenuUnfoldOutlined
                style={{ fontSize: 18, cursor: 'pointer', color: '#0f172a', flexShrink: 0 }}
                onClick={() => setCollapsed(false)}
              />
            ) : (
              <MenuFoldOutlined
                style={{ fontSize: 18, cursor: 'pointer', color: '#0f172a', flexShrink: 0 }}
                onClick={() => setCollapsed(true)}
              />
            )}
            <span style={{ color: '#1e293b', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
              Staff portal · Orders only
            </span>
            <Link to="/" style={{ marginLeft: 'auto', color: '#047857', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' }}>
              Back to store
            </Link>
          </Header>
          <Content
            style={{
              margin: isCompact ? 8 : 16,
              overflow: 'auto',
              background: '#c9d4cf',
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
                border: '1px solid #94a3b8',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.1)',
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
