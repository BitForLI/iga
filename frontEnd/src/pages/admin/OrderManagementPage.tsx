import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Table, Button, message, Modal, Input, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { DELIVERY_SUBURBS, formatDeliverySuburbDisplay, suburbToKey } from '../../constants/deliveryZones';

const BROADCAST_KEY = 'iga_order_broadcast_enabled';

// 播放新订单提示音（循环），返回停止函数；需用户点击启用（浏览器自动播放策略）
function useOrderAlertSound() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const playBeep = useCallback(() => {
    try {
      const ctx = ctxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      ctxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
  }, []);

  const play = useCallback(() => {
    playBeep();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(playBeep, 1000);
  }, [playBeep]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const [enabled, setEnabled] = useState(() => typeof window !== 'undefined' && localStorage.getItem(BROADCAST_KEY) === '1');
  const enable = useCallback(() => {
    playBeep();
    stop();
    localStorage.setItem(BROADCAST_KEY, '1');
    setEnabled(true);
  }, [playBeep, stop]);

  return { play, stop, enable, isEnabled: enabled };
}

/** 履约订单：待支付 → 待接单 → 备货 → 待取/待送 → 已完成（已取/已交接） */
const TAB_ITEMS = [
  { key: 'Pending', label: 'Awaiting payment' },
  { key: 'Paid', label: 'To accept' },
  { key: 'Preparing', label: 'Preparing' },
  { key: 'PreparedPickup', label: 'Ready for pickup' },
  { key: 'PreparedDelivery', label: 'Ready for delivery' },
  { key: 'CompletedPickup', label: 'Completed (pickup)' },
  { key: 'CompletedDelivery', label: 'Completed (delivery)' },
  { key: 'RefundRequested', label: 'Refund requests' },
] as const;

function resolveTabParams(tab: string | undefined): { status?: string; orderType?: string; pickedUp?: boolean } {
  if (!tab) return { status: 'Pending' };
  if (tab === 'PreparedPickup') return { status: 'Prepared', orderType: 'Pickup', pickedUp: false };
  if (tab === 'PreparedDelivery') return { status: 'Prepared', orderType: 'Delivery', pickedUp: false };
  if (tab === 'CompletedPickup') return { status: 'Prepared', orderType: 'Pickup', pickedUp: true };
  if (tab === 'CompletedDelivery') return { status: 'Prepared', orderType: 'Delivery', pickedUp: true };
  if (tab === 'Pending' || tab === 'Paid' || tab === 'Preparing' || tab === 'RefundRequested') return { status: tab };
  return { status: 'Pending' };
}

type OrderTabKey = (typeof TAB_ITEMS)[number]['key'];

interface OrderRow {
  id: number;
  userId: number;
  userName: string;
  userPhone: string;
  totalAmount: number;
  finalAmount?: number;
  orderStatus: string;
  orderType: string;
  pickupTime?: string;
  pickupCode?: string;
  deliveryAddress?: string;
  deliverySuburb?: string;
  createdAt: string;
  pickedUpAt?: string | null;
}

interface OrderManagementPageProps {
  initialTab?: OrderTabKey;
  visibleTabKeys?: readonly OrderTabKey[];
}

export function OrderManagementPage({ initialTab = 'Pending', visibleTabKeys }: OrderManagementPageProps = {}) {
  const { adminBasePath = '/admin' } = useOutletContext<{ adminBasePath?: string }>() ?? {};
  const navigate = useNavigate();
  const { play: playAlert, stop: stopAlert, enable: enableBroadcast, isEnabled: broadcastEnabled } = useOrderAlertSound();

  useEffect(() => {
    const stopOnUserGesture = () => {
      stopAlert();
    };
    window.addEventListener('click', stopOnUserGesture, true);
    window.addEventListener('keydown', stopOnUserGesture, true);
    return () => {
      window.removeEventListener('click', stopOnUserGesture, true);
      window.removeEventListener('keydown', stopOnUserGesture, true);
    };
  }, [stopAlert]);
  const [data, setData] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const seenOrderIdsRef = useRef<Set<number>>(new Set());
  const paidAlertsInitRef = useRef(false);
  const visibleTabs = useMemo(() => {
    if (!visibleTabKeys?.length) return [...TAB_ITEMS];
    const filtered = TAB_ITEMS.filter((tab) => visibleTabKeys.includes(tab.key));
    return filtered.length > 0 ? filtered : [...TAB_ITEMS];
  }, [visibleTabKeys]);
  const isRefundsOnlyPage = Boolean(
    visibleTabKeys?.length === 1 && visibleTabKeys[0] === 'RefundRequested'
  );
  const hideTabBar = Boolean(visibleTabKeys?.length === 1);
  const pageTitle = useMemo(() => {
    if (hideTabBar && visibleTabKeys?.[0]) {
      const item = TAB_ITEMS.find((t) => t.key === visibleTabKeys[0]);
      return item?.label ?? 'Orders';
    }
    return 'Order management';
  }, [hideTabBar, visibleTabKeys]);
  const [pickupCodeDraft, setPickupCodeDraft] = useState('');
  const [pickupCodeFilter, setPickupCodeFilter] = useState('');
  const [deliverySuburbFilter, setDeliverySuburbFilter] = useState('');

  useEffect(() => {
    setActiveTab(initialTab);
    setPickupCodeDraft('');
    setPickupCodeFilter('');
    setDeliverySuburbFilter('');
  }, [initialTab]);

  const fetchOrders = useCallback(async (page = 1, pageSize = 10, tabKey?: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { status, orderType, pickedUp } = resolveTabParams(tabKey);
      const params: Record<string, string | number | boolean | undefined> = {
        page,
        pageSize,
        ...(status ? { status } : {}),
        ...(orderType ? { orderType } : {}),
        ...(pickedUp !== undefined ? { pickedUp } : {}),
      };
      if (tabKey === 'PreparedPickup') {
        const digits = pickupCodeFilter.replace(/\D/g, '');
        if (digits) params.pickupCode = digits;
      }
      if (tabKey === 'PreparedDelivery' && deliverySuburbFilter.trim()) {
        params.deliverySuburb = deliverySuburbFilter.trim().toLowerCase();
      }
      const res = (await apiClient.get('/admin/orders', { params })) as { items?: any[]; total?: number };
      const list = res?.items ?? [];
      const rows = list.map((o: any) => ({
        id: o.id,
        userId: o.userId,
        userName: o.userName ?? '',
        userPhone: o.userPhone ?? '',
        totalAmount: Number(o.totalAmount ?? 0),
        finalAmount: o.finalAmount != null ? Number(o.finalAmount) : undefined,
        orderStatus: o.orderStatus ?? 'Pending',
        orderType: o.orderType ?? '',
        pickupTime: o.pickupTime,
        pickupCode: o.pickupCode ?? o.PickupCode ?? '',
        deliveryAddress: o.deliveryAddress,
        deliverySuburb: o.deliverySuburb ?? o.DeliverySuburb ?? '',
        createdAt: o.createdAt,
        pickedUpAt: o.pickedUpAt ?? o.PickedUpAt ?? null,
      }));
      setData(rows);
      setPagination((p) => ({ ...p, current: page, pageSize, total: res?.total ?? 0 }));

      // 新「待接单」(Paid) 提醒：需先点 Enable；首轮拉取只建立基线不响，之后出现新 Paid id 才响（含从 0→1）
      if (page === 1 && resolveTabParams(tabKey).status === 'Paid' && typeof window !== 'undefined' && localStorage.getItem(BROADCAST_KEY) === '1') {
        const seen = seenOrderIdsRef.current;
        const newPaidRows = rows.filter((r: OrderRow) => r.orderStatus === 'Paid' && !seen.has(r.id));
        if (paidAlertsInitRef.current && newPaidRows.length > 0) playAlert();
        rows.forEach((r: OrderRow) => {
          if (r.orderStatus === 'Paid') seen.add(r.id);
        });
        paidAlertsInitRef.current = true;
      }
    } catch {
      if (!silent) message.error('Failed to load orders');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [pickupCodeFilter, deliverySuburbFilter, playAlert]);

  // 获取各分类订单数量（用于 tab 显示）
  const fetchCounts = useCallback(async () => {
    try {
      const c = (await apiClient.get('/admin/orders/counts')) as Record<string, number | undefined>;
      // 与列表筛选一致：Pickup / Delivery 分开计数（后端 PreparedPickup、PreparedDelivery）
      setTabCounts({
        Pending: (c?.pending ?? c?.Pending) ?? 0,
        Paid: (c?.paid ?? c?.Paid) ?? 0,
        Preparing: (c?.preparing ?? c?.Preparing) ?? 0,
        PreparedPickup: (c?.preparedPickup ?? c?.PreparedPickup) ?? 0,
        PreparedDelivery: (c?.preparedDelivery ?? c?.PreparedDelivery) ?? 0,
        CompletedPickup: (c?.completedPickup ?? c?.CompletedPickup) ?? 0,
        CompletedDelivery: (c?.completedDelivery ?? c?.CompletedDelivery) ?? 0,
        RefundRequested: (c?.refundRequested ?? c?.RefundRequested) ?? 0,
      });
    } catch (_) {}
  }, []);

  // 初始加载 + 切换 tab 或筛选时（回到第 1 页）
  useEffect(() => {
    setPagination((p) => ({ ...p, current: 1 }));
    fetchOrders(1, pagination.pageSize, activeTab);
  }, [activeTab, pickupCodeFilter, deliverySuburbFilter, fetchOrders]);

  // 初始加载及切换 tab / 操作后刷新数量
  useEffect(() => {
    fetchCounts();
  }, [fetchCounts, activeTab]);

  // 轮询：待支付 / 待接单 每 10 秒静默刷新（新单与数量）
  useEffect(() => {
    if (activeTab !== 'Paid' && activeTab !== 'Pending') return;
    const tid = setInterval(() => {
      fetchOrders(1, pagination.pageSize, activeTab, true);
      void fetchCounts();
    }, 10000);
    return () => clearInterval(tid);
  }, [activeTab, pagination.pageSize, fetchOrders, fetchCounts]);

  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectModalOrderId, setRejectModalOrderId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleAcceptOrder = async (orderId: number) => {
    setAcceptingId(orderId);
    try {
      await apiClient.post(`/admin/order-accept/${orderId}`, {});
      message.success('Order accepted, moved to preparing');
      stopAlert();
      if (adminBasePath === '/staff') {
        navigate(`${adminBasePath}/orders/preparing`);
      } else {
        setActiveTab('Preparing');
      }
      fetchCounts();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleApproveRefund = async (orderId: number) => {
    const ok = window.confirm(`Approve refund for order #${orderId}? This will refund through Stripe.`);
    if (!ok) return;
    setRefundingId(orderId);
    try {
      const res = (await apiClient.post(`/admin/order-refund-approve/${orderId}`, {})) as {
        stripeRefundId?: string;
        refundAmount?: number;
      };
      message.success(`Refund processed${res?.stripeRefundId ? ` (${res.stripeRefundId})` : ''}`);
      fetchCounts();
      fetchOrders(pagination.current, pagination.pageSize, activeTab, true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRefundingId(null);
    }
  };

  const handleRejectRefund = async (orderId: number) => {
    setRejectModalOrderId(orderId);
    setRejectReason('');
  };

  const confirmRejectRefund = async () => {
    if (rejectModalOrderId == null) return;
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      message.warning('Rejection reason is required');
      return;
    }

    setRejectingId(rejectModalOrderId);
    try {
      await apiClient.post(`/admin/order-refund-reject/${rejectModalOrderId}`, { reason: trimmed });
      message.success('Refund request rejected');
      setRejectModalOrderId(null);
      setRejectReason('');
      fetchCounts();
      fetchOrders(pagination.current, pagination.pageSize, activeTab, true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRejectingId(null);
    }
  };

  const [pickedUpId, setPickedUpId] = useState<number | null>(null);
  const handleMarkPickedUp = async (orderId: number, orderType: string) => {
    setPickedUpId(orderId);
    try {
      await apiClient.post(`/admin/order-picked-up/${orderId}`, {});
      message.success('Marked as picked up — see Completed in the Orders menu');
      fetchCounts();
      fetchOrders(pagination.current, pagination.pageSize, activeTab, true);
      if (adminBasePath === '/staff') {
        const next =
          orderType === 'Delivery' ? `${adminBasePath}/orders/completed-delivery` : `${adminBasePath}/orders/completed-pickup`;
        navigate(next);
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPickedUpId(null);
    }
  };

  const [readyId, setReadyId] = useState<number | null>(null);
  const handleMarkReady = async (orderId: number, orderType: string) => {
    setReadyId(orderId);
    try {
      await apiClient.post(`/admin/order-ready/${orderId}`, {});
      message.success('Moved to ready queue');
      fetchCounts();
      fetchOrders(1, pagination.pageSize, activeTab, true);
      if (adminBasePath === '/staff') {
        const next =
          orderType === 'Delivery' ? `${adminBasePath}/orders/delivery` : `${adminBasePath}/orders/pickup`;
        navigate(next);
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setReadyId(null);
    }
  };

  const columns: ColumnsType<OrderRow> = [
    {
      title: 'Order #',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      render: (id: number) => (
        <Button type="link" onClick={() => navigate(`${adminBasePath}/orders/${id}`)} style={{ padding: 0 }}>
          #{id}
        </Button>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    { title: 'Customer', key: 'user', render: (_, r) => (r.userName && r.userPhone ? `${r.userName} (${r.userPhone})` : (r.userName || r.userPhone || '-')) },
    {
      title: 'Type',
      key: 'orderType',
      width: 90,
      render: (_: unknown, r: OrderRow) => (r.orderType === 'Pickup' ? 'Pickup' : r.orderType === 'Delivery' ? 'Delivery' : r.orderType || '-'),
    },
    {
      title: 'Code / Area',
      key: 'codeOrArea',
      width: 100,
      render: (_: unknown, r: OrderRow) =>
        r.orderType === 'Pickup' ? (r.pickupCode || '—') : r.orderType === 'Delivery' ? formatDeliverySuburbDisplay(r.deliverySuburb) : '—',
    },
    {
      title: 'Pickup / Delivery',
      key: 'pickupOrDelivery',
      width: 160,
      render: (_: unknown, r: OrderRow) => {
        if (r.pickedUpAt) {
          const t = new Date(r.pickedUpAt).toLocaleString('en-AU', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return <span style={{ color: '#059669' }}>Done {t}</span>;
        }
        if (r.orderType === 'Pickup' && r.pickupTime) {
          return new Date(r.pickupTime).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
        if (r.orderType === 'Delivery' && r.deliveryAddress) {
          return r.deliveryAddress.length > 12 ? `${r.deliveryAddress.slice(0, 12)}…` : r.deliveryAddress;
        }
        return '-';
      },
    },
    {
      title: 'Total',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 100,
      render: (v: number, r) => `$${(r.finalAmount ?? v ?? 0).toFixed(2)}`,
    },
    {
      title: 'Actions',
      key: 'action',
      width: 220,
      render: (_, r) => (
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {r.orderStatus === 'Pending' && (
            <span style={{ fontSize: 12, color: '#d97706' }}>Awaiting payment</span>
          )}
          {r.orderStatus === 'RefundRequested' && (
            <>
              <Button
                danger
                size="small"
                loading={refundingId === r.id}
                onClick={() => handleApproveRefund(r.id)}
              >
                Approve refund
              </Button>
              <Button
                size="small"
                loading={rejectingId === r.id}
                onClick={() => handleRejectRefund(r.id)}
              >
                Reject refund
              </Button>
            </>
          )}
          {r.orderStatus === 'Paid' && (
            <Button
              type="primary"
              size="small"
              loading={acceptingId === r.id}
              onClick={() => handleAcceptOrder(r.id)}
            >
              Accept
            </Button>
          )}
          {r.orderStatus === 'Preparing' && (
            <Button
              size="small"
              loading={readyId === r.id}
              onClick={() => handleMarkReady(r.id, r.orderType)}
            >
              Ready
            </Button>
          )}
          {r.orderStatus === 'Prepared' && !r.pickedUpAt && (
            <Button
              size="small"
              loading={pickedUpId === r.id}
              onClick={() => handleMarkPickedUp(r.id, r.orderType)}
            >
              {r.orderType === 'Delivery' ? 'Handed off' : 'Picked up'}
            </Button>
          )}
          {r.orderStatus === 'Prepared' && r.pickedUpAt && (
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Completed</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>{pageTitle}</h2>
          {isRefundsOnlyPage && (
            <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b7280' }}>
              Open requests: <strong>{tabCounts.RefundRequested ?? 0}</strong>
            </p>
          )}
        </div>
        {activeTab === 'Paid' && !broadcastEnabled && (
          <Button type="primary" ghost onClick={enableBroadcast}>
            🔊 Enable new order alerts
          </Button>
        )}
        {activeTab === 'Paid' && broadcastEnabled && (
          <span style={{ color: '#dc2626', fontSize: 14 }}>🔔 Alerts enabled</span>
        )}
      </div>
      {!hideTabBar && (
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid #e5e5e5',
            marginBottom: 16,
          }}
        >
          {visibleTabs.map(({ key, label }) => {
            const count = tabCounts[key] ?? '-';
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setPickupCodeDraft('');
                  setPickupCodeFilter('');
                  setDeliverySuburbFilter('');
                  setActiveTab(key);
                }}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderBottom: activeTab === key ? '2px solid #dc2626' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: activeTab === key ? 600 : 400,
                  color: activeTab === key ? '#dc2626' : '#525252',
                }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}
      {activeTab === 'PreparedPickup' && (
        <div style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="Search by pickup code (digits, partial OK)"
            value={pickupCodeDraft}
            onChange={(e) => setPickupCodeDraft(e.target.value)}
            onSearch={(v) => {
              setPickupCodeFilter((v ?? '').replace(/\D/g, ''));
            }}
            style={{ maxWidth: 400 }}
            enterButton="Search"
          />
        </div>
      )}
      {activeTab === 'PreparedDelivery' && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: '#64748b', fontSize: 14 }}>Filter by suburb</span>
          <Select
            allowClear
            placeholder="All areas"
            value={deliverySuburbFilter || undefined}
            style={{ width: 220 }}
            onChange={(v) => {
              setDeliverySuburbFilter(typeof v === 'string' ? v : '');
            }}
            options={DELIVERY_SUBURBS.map((label) => ({
              value: suburbToKey(label),
              label,
            }))}
          />
        </div>
      )}
      <Table<OrderRow>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} items`,
          onChange: (page, pageSize) => {
            setPagination((p) => ({ ...p, current: page, pageSize: pageSize ?? 10 }));
            fetchOrders(page, pageSize ?? 10, activeTab);
          },
        }}
      />
      <Modal
        title={`Reject refund${rejectModalOrderId != null ? ` for order #${rejectModalOrderId}` : ''}`}
        open={rejectModalOrderId != null}
        okText="Reject refund"
        okButtonProps={{ danger: true, loading: rejectingId === rejectModalOrderId }}
        onOk={confirmRejectRefund}
        onCancel={() => {
          setRejectModalOrderId(null);
          setRejectReason('');
        }}
      >
        <p style={{ color: '#6b7280', marginTop: 0 }}>
          Please enter the reason shown to the customer.
        </p>
        <Input.TextArea
          rows={4}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="Example: This order is already prepared and cannot be refunded."
          maxLength={500}
          showCount
        />
      </Modal>
    </div>
  );
}
