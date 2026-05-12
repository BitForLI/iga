import { useState } from 'react';
import serviceIcon from '../assets/images/客服.png';

/** 原左侧栏底部「联系客服」，侧栏移除后改为左下角浮动入口 */
export function ContactService() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Contact Service"
        style={{
          position: 'fixed',
          left: 12,
          bottom: 12,
          zIndex: 95,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 9999,
          border: '1px solid #e5e7eb',
          backgroundColor: 'white',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 13,
          color: '#333',
        }}
      >
        <img src={serviceIcon} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span>Contact</span>
      </button>

      {open && (
        <>
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
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
                type="button"
                onClick={() => setOpen(false)}
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
              type="button"
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
