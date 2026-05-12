import { useState, type FormEvent } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { authAPI } from '../api';
import { useAuth } from '../context/AuthContext';
import { PasswordResetForm } from '../components/PasswordResetForm';

export function Register() {
  const [formData, setFormData] = useState({
    Name: '',
    Email: '',
    Password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');
  const { setUser } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmitRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessBanner('');
    setLoading(true);
    try {
      await authAPI.register({
        name: formData.Name,
        email: formData.Email,
        password: formData.Password,
      });
      setStep('verify');
      setCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.verifyEmail({
        email: formData.Email,
        code: code.replace(/\D/g, '').slice(0, 6),
      });
      const res = (await authAPI.login({
        email: formData.Email,
        password: formData.Password,
      })) as unknown as { id: number; name: string; email: string; phoneNumber?: string; role?: string };
      setUser({
        id: res.id,
        name: res.name,
        email: res.email,
        phoneNumber: res.phoneNumber ?? '',
        role: res.role ?? 'Customer',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      await authAPI.resendVerification({ email: formData.Email });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (passwordResetOpen) {
    return (
      <div className="space-y-4 max-w-md mx-auto p-4">
        <h2 className="text-2xl font-bold">Change password</h2>
        <PasswordResetForm
          initialEmail={formData.Email}
          onBack={() => { setPasswordResetOpen(false); setError(''); }}
          onSuccess={() => {
            setPasswordResetOpen(false);
            setSuccessBanner('Your password has been updated. Please sign in with your new password.');
            setStep('form');
          }}
        />
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <form onSubmit={handleVerify} className="space-y-4 max-w-md mx-auto p-4">
        <h2 className="text-2xl font-bold">Verify email</h2>
        <p className="text-sm text-gray-600">
          Enter the 6-digit code sent to <strong>{formData.Email}</strong>
        </p>
        {error && <p className="text-red-500">{error}</p>}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
          className="w-full p-2 border rounded tracking-widest text-center text-lg"
        />
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Verify and sign in'}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={loading}
          className="w-full border border-gray-300 p-2 rounded text-sm"
        >
          Resend code
        </button>
        <button
          type="button"
          onClick={() => { setStep('form'); setError(''); }}
          className="w-full text-sm text-gray-600 hover:underline"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => { setSuccessBanner(''); setPasswordResetOpen(true); setError(''); }}
          className="w-full text-sm text-gray-600 hover:underline"
        >
          Change password
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmitRegister} className="space-y-4 max-w-md mx-auto p-4">
      <h2 className="text-2xl font-bold">Register</h2>
      {successBanner && <p className="text-sm text-green-700 bg-green-50 p-2 rounded">{successBanner}</p>}
      {error && <p className="text-red-500">{error}</p>}

      <input
        type="text"
        name="Name"
        placeholder="Name"
        value={formData.Name}
        onChange={handleChange}
        required
        className="w-full p-2 border rounded"
      />

      <input
        type="email"
        name="Email"
        placeholder="Email"
        value={formData.Email}
        onChange={handleChange}
        required
        className="w-full p-2 border rounded"
      />

      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type={showPassword ? 'text' : 'password'}
          name="Password"
          placeholder="Password"
          value={formData.Password}
          onChange={handleChange}
          required
          autoComplete="new-password"
          style={{
            width: '100%',
            padding: '0.5rem 2.25rem 0.5rem 0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          onClick={() => setShowPassword((v) => !v)}
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '0.35rem',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            lineHeight: 1,
          }}
        >
          {showPassword ? (
            <EyeInvisibleOutlined style={{ fontSize: 18 }} />
          ) : (
            <EyeOutlined style={{ fontSize: 18 }} />
          )}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Sending code...' : 'Send verification code'}
      </button>
      <button
        type="button"
        onClick={() => { setSuccessBanner(''); setPasswordResetOpen(true); setError(''); }}
        className="w-full text-sm text-gray-600 hover:underline"
      >
        Change password
      </button>
    </form>
  );
}
