import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Descriptions, Table, Button, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { apiClient } from '../../api/client';

interface OrderDetail {
  id: number;
  userId: number;
  userName: string;
  userPhone: string;
  totalAmount: number;
  finalAmount?: number;
  refundAmount: number;
  orderStatus: string;
  orderType: string;
  pickupCode: string;
  pickupTime?: string;
  deliveryAddress?: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  items: { id: number; productId: number; productName: string; quantity: number; priceAtPurchase: number; expectedWeight?: number; actualWeight?: number }[];
  createdAt: string;
}

export function OrderDetailPage() {
  const { adminBasePath = '/admin' } = useOutletContext<{ adminBasePath?: string }>() ?? {};
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);

  const fetchOrder = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const raw = (await apiClient.get(`/order/${id}`)) as Record<string, unknown>;
      const itemsRaw = raw.items ?? raw.Items;
      const items = Array.isArray(itemsRaw)
        ? (itemsRaw as OrderDetail['items']).map((it: any) => ({
            id: it.id ?? it.Id,
            productId: it.productId ?? it.ProductId,
            productName: it.productName ?? it.ProductName ?? '',
            quantity: Number(it.quantity ?? it.Quantity ?? 0),
            priceAtPurchase: Number(it.priceAtPurchase ?? it.PriceAtPurchase ?? 0),
            expectedWeight: it.expectedWeight ?? it.ExpectedWeight,
            actualWeight: it.actualWeight ?? it.ActualWeight,
          }))
        : [];
      setOrder({
        id: Number(raw.id ?? raw.Id),
        userId: Number(raw.userId ?? raw.UserId),
        userName: String(raw.userName ?? raw.UserName ?? ''),
        userPhone: String(raw.userPhone ?? raw.UserPhone ?? ''),
        totalAmount: Number(raw.totalAmount ?? raw.TotalAmount ?? 0),
        finalAmount: raw.finalAmount != null ? Number(raw.finalAmount ?? raw.FinalAmount) : undefined,
        refundAmount: Number(raw.refundAmount ?? raw.RefundAmount ?? 0),
        orderStatus: String(raw.orderStatus ?? raw.OrderStatus ?? ''),
        orderType: String(raw.orderType ?? raw.OrderType ?? ''),
        pickupCode: String(raw.pickupCode ?? raw.PickupCode ?? ''),
        pickupTime: raw.pickupTime as string | undefined,
        deliveryAddress: raw.deliveryAddress as string | undefined,
        stripeSessionId: raw.stripeSessionId as string | undefined,
        stripePaymentIntentId: raw.stripePaymentIntentId as string | undefined,
        items,
        createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
      });
    } catch {
      message.error('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [id]);

  const handleAcceptOrder = async () => {
    if (!order || !id || order.orderStatus !== 'Paid') return;
    setAccepting(true);
    try {
      await apiClient.post(`/admin/order-accept/${id}`, {});
      message.success('Order accepted, moved to preparing');
      fetchOrder();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setAccepting(false);
    }
  };

  const handleMarkReady = async () => {
    if (!order || !id || order.orderStatus !== 'Preparing') return;
    setMarkingReady(true);
    try {
      await apiClient.post(`/admin/order-ready/${id}`, {});
      message.success('Moved to ready for pickup');
      fetchOrder();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setMarkingReady(false);
    }
  };

  const itemColumns = [
    {
      title: 'Product',
      dataIndex: 'productName',
      key: 'productName',
      render: (text: string) => <span style={{ fontWeight: 600, fontSize: 15 }}>{text}</span>,
    },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80 },
    {
      title: 'Price',
      dataIndex: 'priceAtPurchase',
      key: 'priceAtPurchase',
      width: 100,
      render: (v: number) => `$${Number(v).toFixed(2)}`,
    },
    {
      title: 'Subtotal',
      key: 'subtotal',
      width: 100,
      render: (_: unknown, r: { quantity: number; priceAtPurchase: number }) =>
        `$${(r.quantity * r.priceAtPurchase).toFixed(2)}`,
    },
  ];

  if (loading || !order) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`${adminBasePath}/orders`)} style={{ marginBottom: 16 }}>
          Back
        </Button>
        <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>
      </div>
    );
  }

  const amount = order.finalAmount ?? order.totalAmount;

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`${adminBasePath}/orders`)} style={{ marginBottom: 16 }}>
        Back
      </Button>
      <h2 style={{ marginBottom: 16 }}>Order #{order.id}</h2>

      <Card
        title={<span style={{ fontSize: 18, fontWeight: 700 }}>商品清单（请按此备货）</span>}
        style={{ marginBottom: 16 }}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Table
          dataSource={order.items ?? []}
          columns={itemColumns}
          rowKey="id"
          pagination={false}
          size="middle"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <strong>合计</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <strong>${amount.toFixed(2)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      <Card title="订单信息">
        <div style={{ marginBottom: 16 }}>
          {order.orderStatus === 'Paid' && (
            <Button type="primary" loading={accepting} onClick={handleAcceptOrder}>
              Accept
            </Button>
          )}
          {order.orderStatus === 'Preparing' && (
            <Button loading={markingReady} onClick={handleMarkReady}>
              Ready
            </Button>
          )}
        </div>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="Order #">#{order.id}</Descriptions.Item>
          <Descriptions.Item label="Date">
            {order.createdAt ? new Date(order.createdAt).toLocaleString() : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Customer">{order.userName || '-'}</Descriptions.Item>
          <Descriptions.Item label="Phone">{order.userPhone || '-'}</Descriptions.Item>
          <Descriptions.Item label="Type">{order.orderType === 'Pickup' ? 'Pickup' : order.orderType === 'Delivery' ? 'Delivery' : order.orderType || '-'}</Descriptions.Item>
          <Descriptions.Item label="Pickup code">{order.pickupCode || '-'}</Descriptions.Item>
          <Descriptions.Item label="Pickup time">
            {order.orderType === 'Pickup' && order.pickupTime ? new Date(order.pickupTime).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="Delivery address">{order.orderType === 'Delivery' ? (order.deliveryAddress || '-') : '-'}</Descriptions.Item>
          <Descriptions.Item label="Total">${amount.toFixed(2)}</Descriptions.Item>
          <Descriptions.Item label="Refunded">${(order.refundAmount ?? 0).toFixed(2)}</Descriptions.Item>
          <Descriptions.Item label="Stripe Session ID">{order.stripeSessionId || '-'}</Descriptions.Item>
          <Descriptions.Item label="Stripe Payment Intent">{order.stripePaymentIntentId || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
