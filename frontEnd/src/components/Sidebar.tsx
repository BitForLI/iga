import { useState, useEffect } from 'react';
import vegetableIcon from '../assets/images/vegetable.png';
import { useMaxWidth } from '../hooks/useMediaQuery';
import fruitIcon from '../assets/images/fruit.png';
import serviceIcon from '../assets/images/客服.png';

interface SidebarProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  navHeight: number;
}

export function Sidebar({ selectedCategory, onSelectCategory, navHeight }: SidebarProps) {
  const isNarrow = useMaxWidth(768);
  const [isOpen, setIsOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 768 : true
  );
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth <= 768) setIsOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const categories = [
    { name: 'Vegetables', icon: vegetableIcon },
    { name: 'Fruit', icon: fruitIcon },
    { name: 'Dairy', icon: fruitIcon },
    { name: 'Meat', icon: vegetableIcon },
    { name: 'Bakery', icon: vegetableIcon },
    { name: 'Pantry', icon: fruitIcon },
  ];

  /** 手机展开时偏窄，避免占满屏；收起条略缩窄 */
  const collapsedW = isNarrow ? 40 : 48;
  const drawerW = isNarrow
    ? Math.min(220, typeof window !== 'undefined' ? window.innerWidth - 20 : 220)
    : 280;

  return (
    <>
      {isNarrow && isOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setIsOpen(false)}
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
          width: isOpen ? (isNarrow ? drawerW : 280) : collapsedW,
          borderRight: '1px solid #e5e7eb',
          height: `calc(100dvh - ${navHeight}px)`,
          overflow: 'hidden',
          transition: 'width 0.3s',
          position: 'fixed',
          left: 0,
          top: `${navHeight}px`,
          zIndex: 110,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'white',
        }}
      >
        {/* 头条：三条杠可点击切换，红底白字 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: '100%',
            padding: isOpen ? (isNarrow ? '0.65rem 0.5rem' : '1rem') : isNarrow ? '0.5rem' : '0.75rem',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            minHeight: isNarrow ? 44 : 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isOpen ? 'flex-start' : 'center',
          }}
        >
          <span style={{ fontSize: isNarrow ? '1.1rem' : '1.25rem', fontWeight: 'bold' }}>☰</span>
          {isOpen && (
            <span
              style={{
                marginLeft: '0.35rem',
                fontSize: isNarrow ? '0.7rem' : '0.875rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: isNarrow ? '0.02em' : undefined,
              }}
            >
              {isNarrow ? 'Categories' : 'Browse Categories'}
            </span>
          )}
        </button>
        {/* 分类列表：白底黑字，收起时隐藏 */}
        {isOpen && (
          <div
            style={{
              flex: 1,
              padding: isNarrow ? '0.5rem 0.45rem' : '1rem',
              backgroundColor: 'white',
              color: '#333',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isNarrow ? '0.25rem' : '0.5rem' }}>
              {categories.map((cat) => (
                <div
                  key={cat.name}
                  onClick={() => onSelectCategory(selectedCategory === cat.name ? '' : cat.name)}
                  style={{
                    padding: isNarrow ? '0.45rem 0.35rem' : '0.75rem',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'all 0.2s',
                    color: selectedCategory === cat.name ? '#dc2626' : '#333',
                    fontWeight: 'bold',
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.06)';
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <img
                    src={cat.icon}
                    alt=""
                    style={{ width: isNarrow ? 20 : 24, height: isNarrow ? 20 : 24, objectFit: 'contain', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: isNarrow ? '0.72rem' : '0.875rem', lineHeight: 1.25 }}>{cat.name}</span>
                  <span style={{ marginLeft: 'auto' }}>›</span>
                </div>
              ))}
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

      {/* 占位：撑开主内容区 */}
      <div
        style={{
          width: isOpen ? (isNarrow ? drawerW : 280) : collapsedW,
          flexShrink: 0,
          transition: 'width 0.3s',
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
