import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Table, Button, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { apiClient } from '../../api/client';

interface OrderItem {
  id: number;
  productName: string;
  quantity: number;
  priceAtPurchase: number;
}

interface OrderSummary {
  id: number;
  totalAmount: number;
  finalAmount?: number;
  orderStatus: string;
  orderType: string;
  createdAt: string;
  items?: OrderItem[];
}

interface UserInfo {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  role: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  Pending: 'Pending',
  Paid: 'To accept',
  Preparing: 'Preparing',
  Prepared: 'Ready for pickup',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [userRes, ordersRes] = await Promise.all([
          apiClient.get(`/admin/users/${id}`) as Promise<UserInfo>,
          apiClient.get(`/order/user/${id}`) as Promise<OrderSummary[]>,
        ]);
        if (cancelled) return;
        if (userRes) setUser(userRes);
        setOrders(Array.isArray(ordersRes) ? ordersRes : []);
      } catch {
        message.error('Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const orderColumns = [
    {
      title: 'Order #',
      dataIndex: 'id',
      key: 'id',
      render: (v: number) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/staff/orders/${v}`)}>
          #{v}
        </Button>
      ),
    },
    { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => (v ? new Date(v).toLocaleString() : '-') },
    {
      title: 'Amount',
      key: 'amount',
      render: (_: unknown, r: OrderSummary) => `$${((r.finalAmount ?? r.totalAmount) ?? 0).toFixed(2)}`,
    },
    { title: 'Type', dataIndex: 'orderType', key: 'orderType' },
    {
      title: 'Status',
      dataIndex: 'orderStatus',
      key: 'orderStatus',
      render: (v: string) => STATUS_LABEL[v] ?? v,
    },
  ];

  if (loading) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/customers')} style={{ marginBottom: 16 }}>
          Back
        </Button>
        <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/customers')} style={{ marginBottom: 16 }}>
        Back
      </Button>
      <h2 style={{ marginBottom: 24 }}>Customer Details</h2>

      <Card title="Basic Info" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="ID">{user?.id}</Descriptions.Item>
          <Descriptions.Item label="Name">{user?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Email">{user?.email ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{user?.phoneNumber ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Role">{user?.role === 'Admin' ? 'Admin' : 'Customer'}</Descriptions.Item>
          <Descriptions.Item label="Registered">
            {user?.createdAt ? new Date(user.createdAt).toLocaleString() : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Order History">
        <Table
          dataSource={orders}
          columns={orderColumns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
}
