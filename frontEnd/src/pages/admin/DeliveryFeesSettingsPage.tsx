import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, InputNumber, Space, Table, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminStoreAPI } from '../../api';

type ZoneRow = { suburb: string; displayName: string; enabled: boolean };
type RuleRow = { id: string; minAmount: number; feeAud: number };

const defaultRules = (): RuleRow[] => [
  { id: 'rule-0', minAmount: 0, feeAud: 10 },
  { id: 'rule-1', minAmount: 69, feeAud: 0 },
];

export function DeliveryFeesSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>(defaultRules());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = (await adminStoreAPI.getSettings()) as {
        freeShippingMinAud?: number;
        deliveryZones?: { suburb?: string; displayName?: string; enabled?: boolean }[];
        deliveryFeeRules?: { minAmount?: number; feeAud?: number }[];
      };
      setZones((raw.deliveryZones ?? []).map((z) => ({
        suburb: String(z.suburb ?? ''),
        displayName: String(z.displayName ?? z.suburb ?? ''),
        enabled: z.enabled !== false,
      })));
      const ruleRows = (raw.deliveryFeeRules ?? []).map((r, index) => ({
        id: `rule-${index}`,
        minAmount: Number(r.minAmount) || 0,
        feeAud: Number(r.feeAud) || 0,
      }));
      setRules(ruleRows.length > 0 ? ruleRows.sort((a, b) => a.minAmount - b.minAmount) : defaultRules());
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
    if (rules.length === 0) {
      message.error('Please add at least one delivery rule.');
      return;
    }
    if (!rules.some((r) => r.minAmount === 0)) {
      message.error('The first delivery rule must start at 0 AUD.');
      return;
    }
    setSaving(true);
    try {
      await adminStoreAPI.putSettings({
        deliveryZoneFees: zones.map((z) => ({ suburb: z.suburb, feeAud: 0, enabled: z.enabled })),
        deliveryFeeRules: rules
          .slice()
          .sort((a, b) => a.minAmount - b.minAmount)
          .map((r) => ({ minAmount: r.minAmount, feeAud: r.feeAud })),
      });
      message.success('Saved');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const zoneColumns: ColumnsType<ZoneRow> = [
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
      title: 'Delivery area',
      dataIndex: 'displayName',
      render: (_, r) => (
        <span style={{ color: r.enabled ? undefined : '#9ca3af' }}>{r.displayName}</span>
      ),
    },
  ];

  const ruleColumns: ColumnsType<RuleRow> = [
    {
      title: 'Minimum subtotal (AUD)',
      dataIndex: 'minAmount',
      render: (_, r, index) => (
        <InputNumber
          min={0}
          step={1}
          value={r.minAmount}
          onChange={(v) => {
            const next = [...rules];
            next[index] = { ...next[index], minAmount: Number(v) || 0 };
            setRules(next.sort((a, b) => a.minAmount - b.minAmount));
          }}
        />
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
            const next = [...rules];
            next[index] = { ...next[index], feeAud: Number(v) || 0 };
            setRules(next);
          }}
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, r) => (
        <Button
          type="link"
          danger
          onClick={() => setRules((prev) => prev.filter((item) => item.id !== r.id))}
          disabled={rules.length <= 1}
        >
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Delivery fees
      </Typography.Title>

      <Typography.Title level={5} style={{ marginBottom: 12 }}>
        Delivery zones
      </Typography.Title>
      <Table<ZoneRow>
        rowKey="suburb"
        loading={loading}
        columns={zoneColumns}
        dataSource={zones}
        pagination={false}
        size="small"
        scroll={{ x: 'max-content' }}
        style={{ maxWidth: '100%', marginBottom: 24 }}
      />

      <Typography.Title level={5} style={{ marginBottom: 12 }}>
        Delivery fee rules
      </Typography.Title>
      <Table<RuleRow>
        rowKey="id"
        loading={loading}
        columns={ruleColumns}
        dataSource={rules}
        pagination={false}
        size="small"
        style={{ maxWidth: '100%', marginBottom: 16 }}
      />
      <Space style={{ marginBottom: 24 }}>
        <Button
          onClick={() =>
            setRules((prev) => [
              ...prev,
              {
                id: `rule-${Date.now()}`,
                minAmount: prev.length > 0 ? Math.max(...prev.map((r) => r.minAmount)) + 1 : 0,
                feeAud: 0,
              },
            ])
          }
        >
          Add rule
        </Button>
      </Space>

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
