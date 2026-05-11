import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Descriptions, Table, Button, message, InputNumber, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { apiClient, ApiRequestError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

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
  stripePaymentIntentId?: string;
  items: {
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    priceAtPurchase: number;
    expectedWeight?: number;
    actualWeight?: number;
    isWeighingRequired?: boolean;
  }[];
  createdAt: string;
}

const WEIGHT_STATUSES = new Set(['Paid', 'Preparing', 'Prepared']);

export function OrderDetailPage() {
  const { adminBasePath = '/admin' } = useOutletContext<{ adminBasePath?: string }>() ?? {};
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  /** Actual total weight draft before saving. */
  const [weightDraft, setWeightDraft] = useState<Record<number, number | null>>({});
  const [savingWeightId, setSavingWeightId] = useState<number | null>(null);

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
            isWeighingRequired: Boolean(it.isWeighingRequired ?? it.IsWeighingRequired),
          }))
        : [];
      const nextOrder: OrderDetail = {
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
        stripePaymentIntentId: raw.stripePaymentIntentId as string | undefined,
        items,
        createdAt: String(raw.createdAt ?? raw.CreatedAt ?? ''),
      };
      setOrder(nextOrder);
      const drafts: Record<number, number | null> = {};
      for (const it of nextOrder.items ?? []) {
        if (it.isWeighingRequired) {
          drafts[it.id] = it.actualWeight != null ? Number(it.actualWeight) : null;
        }
      }
      setWeightDraft(drafts);
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

  const canEnterWeight =
    user && (user.role === 'Admin' || user.role === 'Staff') && order && WEIGHT_STATUSES.has(order.orderStatus);

  const handleSaveActualWeight = async (itemId: number) => {
    if (!user?.id || !canEnterWeight) return;
    const v = weightDraft[itemId];
    if (v == null || Number.isNaN(v) || v < 0) {
      message.warning('Enter a valid actual weight.');
      return;
    }
    setSavingWeightId(itemId);
    try {
      const res = (await apiClient.put(`/order/item/${itemId}/weight`, { actualWeight: v }, {
        headers: { 'X-Admin-Id': String(user.id) },
      })) as { refundInfo?: { stripeRefundId?: string; deltaRefund?: number; cappedByPaidAmount?: boolean }; message?: string };
      const stripeId = res?.refundInfo?.stripeRefundId;
      const delta = res?.refundInfo?.deltaRefund;
      const capped = res?.refundInfo?.cappedByPaidAmount;
      if (stripeId) {
        message.success(`Actual weight saved. Stripe refund processed ($${Number(delta ?? 0).toFixed(2)}${capped ? ', capped by paid amount' : ''}).`);
      } else if (delta != null && delta > 0.01) {
        message.success('Refund amount recorded. Non-Stripe orders are not refunded automatically.');
      } else {
        message.success(res?.message ?? 'Actual weight saved');
      }
      fetchOrder();
    } catch (e) {
      const err = e as ApiRequestError;
      message.error(err?.message ?? 'Failed to save actual weight');
    } finally {
      setSavingWeightId(null);
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
    {
      title: 'Expected (kg)',
      key: 'expW',
      width: 110,
      render: (_: unknown, r: OrderDetail['items'][number]) =>
        r.isWeighingRequired ? (r.expectedWeight != null ? Number(r.expectedWeight).toFixed(3) : '-') : '—',
    },
    {
      title: 'Actual (kg)',
      key: 'actualW',
      width: 200,
      render: (_: unknown, r: OrderDetail['items'][number]) => {
        if (!r.isWeighingRequired) return '—';
        if (!canEnterWeight) {
          return (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {order?.orderStatus === 'Pending' ? 'Available after payment' : '—'}
            </Typography.Text>
          );
        }
        return (
          <Space size="small" wrap>
            <InputNumber
              min={0}
              step={0.01}
              precision={3}
              style={{ width: 110 }}
              value={weightDraft[r.id] ?? null}
              onChange={(n) => setWeightDraft((d) => ({ ...d, [r.id]: n }))}
              placeholder="Actual"
            />
            <Button
              type="primary"
              size="small"
              loading={savingWeightId === r.id}
              onClick={() => void handleSaveActualWeight(r.id)}
            >
              Save & refund
            </Button>
          </Space>
        );
      },
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
        title={<span style={{ fontSize: 18, fontWeight: 700 }}>Items to Prepare</span>}
        style={{ marginBottom: 16 }}
        styles={{ body: { paddingTop: 12 } }}
        extra={
          canEnterWeight ? (
            <Typography.Text type="secondary" style={{ fontSize: 12, maxWidth: 360 }}>
              Weighed items: enter the <strong>actual total weight</strong>. If the actual weight is lower than expected, paid orders are automatically partially refunded through Stripe, capped by the paid amount.
            </Typography.Text>
          ) : null
        }
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
                <Table.Summary.Cell index={0} colSpan={5}>
                  <strong>Total</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <strong>${amount.toFixed(2)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      <Card title="Order Information">
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
          <Descriptions.Item label="Stripe Payment Intent">{order.stripePaymentIntentId || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
