import { useState } from 'react';
import { orderAPI } from '../api';

export function OrderVerify({ orderId }: { orderId: number }) {
  const [pickupCode, setPickupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const digits = pickupCode.replace(/\D/g, '').slice(0, 6);
    if (digits.length !== 6) {
      setError('请输入邮件中的 6 位取货码');
      return;
    }
    setLoading(true);

    try {
      await orderAPI.verify(orderId, { pickupCode: digits });
      setMessage('✅ Order verified');
      setPickupCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleVerify} className="max-w-sm mx-auto p-4 space-y-2">
      <h3 className="font-bold">Verify Order</h3>
      {message && <p className="text-green-600">{message}</p>}
      {error && <p className="text-red-500">{error}</p>}

      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="Enter 6-digit pickup code"
        value={pickupCode}
        onChange={(e) =>
          setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 6))
        }
        maxLength={6}
        required
        className="w-full p-2 border rounded"
      />

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:opacity-50"
      >
        {loading ? 'Verifying...' : 'Verify'}
      </button>
    </form>
  );
}
