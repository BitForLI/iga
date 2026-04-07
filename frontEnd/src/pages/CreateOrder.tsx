import { useState, type FormEvent } from 'react';
import { orderAPI, paymentAPI } from '../api';
import { useAuth } from '../context/AuthContext';

interface OrderItem {
  ProductId: number;
  Quantity: number;
  ExpectedWeight: number;
}

export function CreateOrder() {
  const { user } = useAuth();
  const [items, setItems] = useState<OrderItem[]>([{ ProductId: 1, Quantity: 1, ExpectedWeight: 1 }]);
  const [pickupTime, setPickupTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return <p className="text-red-500 p-4">Please log in first</p>;
  }

  const handleAddItem = () => {
    setItems([...items, { ProductId: 1, Quantity: 1, ExpectedWeight: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const orderRes = await orderAPI.create({
        UserId: user.id,
        OrderType: 'Pickup',
        PickupTime: pickupTime,
        Items: items,
      });

      const orderData = (orderRes as any).orderId || 0;
      
      // 创建 Checkout Session
      await paymentAPI.createCheckout(orderData);
      
      console.log('订单已创建，ID:', orderData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4 space-y-4">
      <h2 className="text-2xl font-bold">Create Order</h2>
      {error && <p className="text-red-500">{error}</p>}

      <div>
        <label className="block mb-2">Pickup time</label>
        <input
          type="datetime-local"
          value={pickupTime}
          onChange={(e) => setPickupTime(e.target.value)}
          required
          className="w-full p-2 border rounded"
        />
      </div>

      <div className="space-y-2">
        <h3 className="font-bold">Items</h3>
        {items.map((item, idx) => (
          <div key={idx} className="flex gap-2 items-end">
            <input
              type="number"
              placeholder="Product ID"
              value={item.ProductId}
              onChange={(e) => handleItemChange(idx, 'ProductId', parseInt(e.target.value))}
              className="w-20 p-2 border rounded"
            />
            <input
              type="number"
              placeholder="Quantity"
              value={item.Quantity}
              onChange={(e) => handleItemChange(idx, 'Quantity', parseInt(e.target.value))}
              className="w-20 p-2 border rounded"
            />
            <input
              type="number"
              step="0.1"
              placeholder="Expected weight"
              value={item.ExpectedWeight}
              onChange={(e) => handleItemChange(idx, 'ExpectedWeight', parseFloat(e.target.value))}
              className="w-32 p-2 border rounded"
            />
            <button
              type="button"
              onClick={() => handleRemoveItem(idx)}
              className="bg-red-500 text-white px-2 py-2 rounded hover:bg-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddItem}
          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          + Add item
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Create Order'}
      </button>
    </form>
  );
}
