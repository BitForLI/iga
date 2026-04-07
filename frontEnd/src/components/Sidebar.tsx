import { useState } from 'react';
import { AppstoreOutlined } from '@ant-design/icons';
import vegetableIcon from '../assets/images/vegetable.png';
import { useMaxWidth } from '../hooks/useMediaQuery';
import fruitIcon from '../assets/images/fruit.png';
import serviceIcon from '../assets/images/客服.png';

interface SidebarProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  navHeight: number;
  /** 由顶栏汉堡控制（窄屏）；宽屏仍可点侧栏红条 */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Sidebar({ selectedCategory, onSelectCategory, navHeight, isOpen, onOpenChange }: SidebarProps) {
  const isNarrow = useMaxWidth(768);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);

  /** value 空字符串表示不过滤分类，与 HomePage 中 !selectedCategory 一致 */
  const categories: { label: string; value: string; icon?: string }[] = [
    { label: 'All Products', value: '' },
    { label: 'Vegetables', value: 'Vegetables', icon: vegetableIcon },
    { label: 'Fruit', value: 'Fruit', icon: fruitIcon },
    { label: 'Dairy', value: 'Dairy', icon: fruitIcon },
    { label: 'Meat', value: 'Meat', icon: vegetableIcon },
    { label: 'Bakery', value: 'Bakery', icon: vegetableIcon },
    { label: 'Pantry', value: 'Pantry', icon: fruitIcon },
  ];

  /** 窄屏收起时不占位（汉堡在顶栏）；宽屏保留细条 */
  const collapsedW = isNarrow ? 0 : 48;
  /** 窄屏抽屉：左缘贴屏、自顶栏下缘起白底铺满，避免左侧/上方露灰缝 */
  const narrowDrawerOpen = isNarrow && isOpen;
  /** 尽量窄，减少列表右侧空白 */
  const narrowDrawerWidth = 'min(168px, 52vw)';

  return (
    <>
      {isNarrow && isOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => onOpenChange(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 98,
            border: 'none',
            padding: 0,
            margin: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            cursor: 'pointer',
          }}
        />
      )}
      {/* 侧边栏：展开 280px，收起时仅显示窄白边 + 顶部三条杠 */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          overflow: 'hidden',
          transition: 'width 0.3s',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'white',
          boxShadow: 'none',
          border: 'none',
          outline: 'none',
          ...(narrowDrawerOpen
            ? {
                top: 0,
                height: '100dvh',
                paddingTop: navHeight,
                boxSizing: 'border-box',
                width: narrowDrawerWidth,
                zIndex: 119,
              }
            : {
                top: `${navHeight}px`,
                height: `calc(100dvh - ${navHeight}px)`,
                width: isNarrow ? (isOpen ? narrowDrawerWidth : 0) : isOpen ? 280 : collapsedW,
                zIndex: 110,
              }),
        }}
      >
        {/* 宽屏：侧栏红条切换；窄屏由顶栏汉堡切换，此处不再显示红条 */}
        {!isNarrow && (
          <button
            type="button"
            onClick={() => onOpenChange(!isOpen)}
            style={{
              width: '100%',
              padding: isOpen ? '1rem' : '0.75rem',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              minHeight: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: isOpen ? 'flex-start' : 'center',
            }}
          >
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>☰</span>
            {isOpen && (
              <span style={{ marginLeft: '0.35rem', fontSize: '0.875rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                Browse Categories
              </span>
            )}
          </button>
        )}
        {/* 分类列表：白底黑字，收起时隐藏 */}
        {isOpen && (
          <div
            style={{
              flex: 1,
              padding: isNarrow ? '0.55rem 0.22rem 0.45rem' : '1rem',
              backgroundColor: 'white',
              color: '#333',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isNarrow ? '0.2rem' : '0.5rem' }}>
              {categories.map((cat) => {
                const isSelected = cat.value === '' ? !selectedCategory : selectedCategory === cat.value;
                return (
                  <div
                    key={cat.label}
                    onClick={() => {
                      if (cat.value === '') {
                        onSelectCategory('');
                      } else {
                        onSelectCategory(selectedCategory === cat.value ? '' : cat.value);
                      }
                      if (isNarrow) onOpenChange(false);
                    }}
                    style={{
                      padding: isNarrow ? '0.4rem 0.15rem' : '0.75rem',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: isNarrow ? '0.45rem' : '0.75rem',
                      transition: 'all 0.2s',
                      color: isSelected ? '#dc2626' : '#333',
                      fontWeight: 'bold',
                    }}
                    onMouseOver={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.06)';
                    }}
                    onMouseOut={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    }}
                  >
                    {cat.icon ? (
                      <img
                        src={cat.icon}
                        alt=""
                        style={{ width: isNarrow ? 18 : 24, height: isNarrow ? 18 : 24, objectFit: 'contain', flexShrink: 0 }}
                      />
                    ) : (
                      <AppstoreOutlined
                        style={{
                          fontSize: isNarrow ? 18 : 24,
                          color: isSelected ? '#dc2626' : '#6b7280',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: isNarrow ? '0.68rem' : '0.875rem',
                        lineHeight: 1.25,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {cat.label}
                    </span>
                    <span style={{ flexShrink: 0, opacity: 0.55, fontSize: isNarrow ? '0.65rem' : '0.875rem' }}>›</span>
                  </div>
                );
              })}
            </div>
            {/* Contact Service */}
            <button
              onClick={() => setServiceDialogOpen(true)}
              style={{
                marginTop: 'auto',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: 'white',
                color: '#333',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.875rem',
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb';
                (e.currentTarget as HTMLElement).style.borderColor = '#dc2626';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'white';
                (e.currentTarget as HTMLElement).style.borderColor = '#e5e7eb';
              }}
            >
              <img src={serviceIcon} alt="" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
              Contact Service
            </button>
          </div>
        )}
      </div>

      {/* 占位：仅宽屏撑开主内容；窄屏侧栏为 fixed 覆盖层，不占位以免商品区被挤窄 */}
      <div
        style={{
          width: isNarrow ? 0 : isOpen ? 280 : collapsedW,
          flexShrink: 0,
          transition: 'width 0.3s',
          minWidth: 0,
        }}
      />

      {/* 联系客服对话框 - 左下角 */}
      {serviceDialogOpen && (
        <>
          <div
            onClick={() => setServiceDialogOpen(false)}
            style={{
              position: 'fixed',
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.3)',
              zIndex: 999,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '1rem',
              bottom: '1rem',
              width: 'min(320px, calc(100vw - 2rem))',
              maxWidth: 'calc(100vw - 2rem)',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              padding: '1.25rem',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>Contact Service</h3>
              <button
                onClick={() => setServiceDialogOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: '#999',
                }}
              >
                ×
              </button>
            </div>
            <input
              type="text"
              placeholder="Your name"
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
            />
            <input
              type="email"
              placeholder="Email"
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
            />
            <textarea
              placeholder="Your message..."
              rows={3}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
                resize: 'vertical',
              }}
            />
            <button
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Send
            </button>
          </div>
        </>
      )}
    </>
  );
}
