import { useState, useEffect, type FormEvent, type CSSProperties } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { authAPI } from '../api';

const accent = '#dc2626';
const muted = '#6b7280';

export type PasswordResetFormProps = {
  /** Email prefilled from the sign-in or sign-up form */
  initialEmail?: string;
  onBack: () => void;
  /** Called after the password was updated successfully */
  onSuccess: () => void;
};

export function PasswordResetForm({ initialEmail = '', onBack, onSuccess }: PasswordResetFormProps) {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState(initialEmail.trim());
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialEmail.trim()) setEmail(initialEmail.trim());
  }, [initialEmail]);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    setInfo('');
    const em = email.trim();
    if (!em) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      const res = (await authAPI.forgotPassword({ email: em })) as { message?: string };
      setInfo(res.message ?? '');
      setStep('confirm');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = (await authAPI.resendPasswordReset({ email: email.trim() })) as { message?: string };
      setInfo(res.message ?? '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    const codeDigits = code.replace(/\D/g, '').slice(0, 6);
    if (codeDigits.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      await authAPI.resetPasswordWithCode({
        email: email.trim(),
        code: codeDigits,
        newPassword,
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    boxSizing: 'border-box',
  };

  const btnPrimary: CSSProperties = {
    backgroundColor: loading ? '#9ca3af' : accent,
    color: 'white',
    padding: '0.75rem',
    borderRadius: '6px',
    border: 'none',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
    width: '100%',
  };

  if (step === 'request') {
    return (
      <form onSubmit={sendCode} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ fontSize: '0.875rem', color: muted, margin: 0 }}>
          We will email a verification code to your address. After you verify it, you can set a new sign-in password.
        </p>
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: accent, padding: '0.75rem', borderRadius: '6px', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}
        <div>
          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </div>
        <button type="submit" disabled={loading} style={btnPrimary}>
          {loading ? 'Sending…' : 'Send verification code'}
        </button>
        <button
          type="button"
          onClick={onBack}
          style={{ border: 'none', background: 'none', color: muted, cursor: 'pointer', fontSize: '0.875rem' }}
        >
          Back to sign in / register
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitReset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {info && (
        <div style={{ backgroundColor: '#ecfdf5', color: '#166534', padding: '0.75rem', borderRadius: '6px', fontSize: '0.875rem' }}>
          {info}
        </div>
      )}
      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: accent, padding: '0.75rem', borderRadius: '6px', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      <p style={{ fontSize: '0.875rem', color: muted, margin: 0 }}>
        If this email is registered, a code was sent to <strong>{email}</strong>. Check your inbox, then enter the code and your new password below.
      </p>
      <div>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Verification code</label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
          style={{ ...inputStyle, letterSpacing: '0.2em', textAlign: 'center' }}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>New password</label>
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            style={{ ...inputStyle, paddingRight: '2.25rem' }}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={showNew ? 'Hide password' : 'Show password'}
            onClick={() => setShowNew((v) => !v)}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              padding: '0.35rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: muted,
              display: 'flex',
            }}
          >
            {showNew ? <EyeInvisibleOutlined style={{ fontSize: 18 }} /> : <EyeOutlined style={{ fontSize: 18 }} />}
          </button>
        </div>
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Confirm new password</label>
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            style={{ ...inputStyle, paddingRight: '2.25rem' }}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
            onClick={() => setShowConfirm((v) => !v)}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              padding: '0.35rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: muted,
              display: 'flex',
            }}
          >
            {showConfirm ? <EyeInvisibleOutlined style={{ fontSize: 18 }} /> : <EyeOutlined style={{ fontSize: 18 }} />}
          </button>
        </div>
      </div>
      <button type="submit" disabled={loading || code.length !== 6} style={{ ...btnPrimary, backgroundColor: loading || code.length !== 6 ? '#9ca3af' : accent }}>
        {loading ? 'Submitting…' : 'Verify and update password'}
      </button>
      <button
        type="button"
        onClick={resendCode}
        disabled={loading}
        style={{
          padding: '0.5rem',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          background: 'white',
          cursor: loading ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        Resend code
      </button>
      <button
        type="button"
        onClick={() => { setStep('request'); setError(''); setInfo(''); setCode(''); setNewPassword(''); setConfirmPassword(''); }}
        style={{ border: 'none', background: 'none', color: muted, cursor: 'pointer', fontSize: '0.875rem' }}
      >
        Previous step
      </button>
      <button
        type="button"
        onClick={onBack}
        style={{ border: 'none', background: 'none', color: muted, cursor: 'pointer', fontSize: '0.875rem' }}
      >
        Back to sign in / register
      </button>
    </form>
  );
}
