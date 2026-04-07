import { useEffect, useState } from 'react';
import { orderAPI } from '../api';

interface Order {
  id: number;
  orderStatus: string;
  totalAmount: number;
  pickupTime: string;
  items: any[];
}

export function OrderStatus({ orderId }: { orderId: number }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await orderAPI.get(orderId);
        setOrder(res as any);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!order) return <p>Order not found</p>;

  return (
    <div className="max-w-md mx-auto p-4 border rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Order #{order.id}</h2>
      
      <div className="space-y-2">
        <p><strong>Status:</strong> <span className={order.orderStatus === 'Paid' ? 'text-green-600' : 'text-yellow-600'}>{order.orderStatus}</span></p>
        <p><strong>Amount:</strong> ${order.totalAmount}</p>
        <p><strong>Pickup time:</strong> {new Date(order.pickupTime).toLocaleString('zh-CN')}</p>
      </div>

      <div className="mt-4">
        <h3 className="font-bold mb-2">Items</h3>
        <ul className="space-y-1">
          {order.items?.map((item: any) => (
            <li key={item.id} className="text-sm">
              {item.productName} x{item.quantity} @ ${item.priceAtPurchase}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
