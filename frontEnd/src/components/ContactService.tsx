import { useState } from 'react';
import { message } from 'antd';
import { contactAPI, ApiRequestError } from '../api';
import serviceIcon from '../assets/images/客服.png';

/** Bottom-left contact: submits to the backend; Resend emails admin/staff with Reply-To set to the customer. */
export function ContactService() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const resetAndClose = () => {
    setOpen(false);
    setName('');
    setEmail('');
    setMsg('');
  };

  const handleSend = async () => {
    const n = name.trim();
    const e = email.trim();
    const m = msg.trim();
    if (!n) {
      message.warning('Please enter your name');
      return;
    }
    if (!e || !e.includes('@')) {
      message.warning('Please enter a valid email');
      return;
    }
    if (!m) {
      message.warning('Please enter a message');
      return;
    }
    setSending(true);
    try {
      const res = (await contactAPI.sendInquiry({ name: n, email: e, message: m })) as { message?: string };
      message.success(res?.message ?? 'Sent. We will get back to you soon.');
      resetAndClose();
    } catch (err) {
      const ae = err as ApiRequestError;
      const detail = (ae?.apiData as { error?: string } | undefined)?.error ?? ae?.message ?? 'Send failed';
      message.error(detail);
    } finally {
      setSending(false);
    }
  };

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
            onClick={() => !sending && setOpen(false)}
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
            onClick={(ev) => ev.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>Contact Service</h3>
              <button
                type="button"
                disabled={sending}
                onClick={() => setOpen(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: sending ? 'not-allowed' : 'pointer',
                  color: '#999',
                }}
              >
                ×
              </button>
            </div>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={sending}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.875rem',
              }}
            />
            <input
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
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
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              disabled={sending}
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
              disabled={sending}
              onClick={() => void handleSend()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: sending ? '#9ca3af' : '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.875rem',
                cursor: sending ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
