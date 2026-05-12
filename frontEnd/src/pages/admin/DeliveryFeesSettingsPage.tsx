import { useCallback, useEffect, useState } from 'react';
import { Button, Form, InputNumber, Space, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminStoreAPI } from '../../api';

type ZoneRow = { suburb: string; displayName: string; feeAud: number };

export function DeliveryFeesSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [freeMin, setFreeMin] = useState(69);
  const [zones, setZones] = useState<ZoneRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = (await adminStoreAPI.getSettings()) as {
        freeShippingMinAud?: number;
        deliveryZoneFees?: { suburb?: string; displayName?: string; feeAud?: number }[];
      };
      setFreeMin(Number(raw.freeShippingMinAud) || 69);
      const rows = (raw.deliveryZoneFees ?? []).map((z) => ({
        suburb: String(z.suburb ?? ''),
        displayName: String(z.displayName ?? z.suburb ?? ''),
        feeAud: Number(z.feeAud) || 0,
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
        deliveryZoneFees: zones.map((z) => ({ suburb: z.suburb, feeAud: z.feeAud })),
      });
      message.success('Saved');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<ZoneRow> = [
    { title: 'Area', dataIndex: 'displayName', width: 160 },
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
      <Form layout="vertical" style={{ maxWidth: 480, marginBottom: 16 }}>
        <Form.Item label="Free shipping from subtotal (AUD)">
          <InputNumber min={0} max={5000} value={freeMin} onChange={(v) => setFreeMin(Number(v) || 0)} style={{ width: '100%' }} />
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
