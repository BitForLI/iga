import { useState } from 'react';
import { orderAPI } from '../api';

export function OrderVerify({ orderId }: { orderId: number }) {
  const [phoneLast4, setPhoneLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await orderAPI.verify(orderId, { PhoneLast4Digits: phoneLast4 });
      setMessage('✅ Order verified');
      setPhoneLast4('');
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
        placeholder="Last 4 digits of phone"
        value={phoneLast4}
        onChange={(e) => setPhoneLast4(e.target.value)}
        maxLength={4}
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
