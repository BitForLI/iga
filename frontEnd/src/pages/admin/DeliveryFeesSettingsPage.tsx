import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, Form, InputNumber, Space, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminStoreAPI } from '../../api';

type ZoneRow = { suburb: string; displayName: string; feeAud: number; enabled: boolean };

export function DeliveryFeesSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [freeMin, setFreeMin] = useState(69);
  const [abnNumber, setAbnNumber] = useState('');
  const [zones, setZones] = useState<ZoneRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = (await adminStoreAPI.getSettings()) as {
        freeShippingMinAud?: number;
        abnNumber?: string;
        deliveryZoneFees?: { suburb?: string; displayName?: string; feeAud?: number; enabled?: boolean }[];
      };
      setFreeMin(Number(raw.freeShippingMinAud) || 69);
      setAbnNumber(String(raw.abnNumber ?? ''));
      const rows = (raw.deliveryZoneFees ?? []).map((z) => ({
        suburb: String(z.suburb ?? ''),
        displayName: String(z.displayName ?? z.suburb ?? ''),
        feeAud: Number(z.feeAud) || 0,
        enabled: z.enabled !== false,
      }));
      setZones(rows);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await adminStoreAPI.putSettings({
        freeShippingMinAud: freeMin,
        abnNumber: abnNumber.trim(),
        deliveryZoneFees: zones.map((z) => ({ suburb: z.suburb, feeAud: z.feeAud, enabled: z.enabled })),
      });
      message.success('Saved');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ZoneRow> = [
    {
      title: 'Active',
      dataIndex: 'enabled',
      width: 100,
      render: (_, r, index) => (
        <Checkbox
          checked={r.enabled}
          onChange={(e) => {
            const next = [...zones];
            next[index] = { ...next[index], enabled: e.target.checked };
            setZones(next);
          }}
        />
      ),
    },
    {
      title: 'Area',
      dataIndex: 'displayName',
      width: 200,
      render: (_, r) => (
        <span style={{ color: r.enabled ? undefined : '#9ca3af' }}>{r.displayName}</span>
      ),
    },
    {
      title: 'Delivery fee (AUD)',
      dataIndex: 'feeAud',
      render: (_, r, index) => (
        <InputNumber
          min={0}
          max={500}
          step={0.5}
          value={r.feeAud}
          onChange={(v) => {
            const next = [...zones];
            next[index] = { ...next[index], feeAud: Number(v) || 0 };
            setZones(next);
          }}
        />
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Delivery fees
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Fees apply per delivery suburb. Orders with subtotal (goods only) at or above the free-shipping minimum pay no delivery fee.
      </Typography.Paragraph>
      <Typography.Paragraph type="secondary">
        Uncheck a suburb to make it unavailable for delivery. Only enabled suburbs can be selected at checkout.
      </Typography.Paragraph>
      <Form layout="vertical" style={{ maxWidth: 480, marginBottom: 16 }}>
        <Form.Item label="Free shipping from subtotal (AUD)">
          <InputNumber min={0} max={5000} value={freeMin} onChange={(v) => setFreeMin(Number(v) || 0)} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label="Store ABN">
          <input
            type="text"
            value={abnNumber}
            onChange={(e) => setAbnNumber(e.target.value)}
            style={{ width: '100%', padding: '8px 11px', borderRadius: 4, border: '1px solid #d9d9d9' }}
          />
        </Form.Item>
      </Form>
      <Table<ZoneRow>
        rowKey="suburb"
        loading={loading}
        columns={columns}
        dataSource={zones}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
        style={{ maxWidth: '100%', marginBottom: 16 }}
      />
      <Space>
        <Button type="primary" onClick={save} loading={saving}>
          Save
        </Button>
        <Button onClick={load} disabled={loading}>
          Reload
        </Button>
      </Space>
    </div>
  );
}
