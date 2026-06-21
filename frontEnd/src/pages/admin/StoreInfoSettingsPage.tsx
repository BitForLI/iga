import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Space, Typography, message } from 'antd';
import { adminStoreAPI } from '../../api';

export function StoreInfoSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [abnNumber, setAbnNumber] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = (await adminStoreAPI.getSettings()) as {
        storeName?: string;
        phoneNumber?: string;
        storeAddress?: string;
        abnNumber?: string;
      };
      setStoreName(String(raw.storeName ?? ''));
      setPhoneNumber(String(raw.phoneNumber ?? ''));
      setStoreAddress(String(raw.storeAddress ?? ''));
      setAbnNumber(String(raw.abnNumber ?? ''));
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
    if (!storeName.trim()) {
      message.error('Store name is required');
      return;
    }
    setSaving(true);
    try {
      await adminStoreAPI.putSettings({
        storeName: storeName.trim(),
        phoneNumber: phoneNumber.trim(),
        storeAddress: storeAddress.trim(),
        abnNumber: abnNumber.trim(),
      });
      message.success('Saved');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Store information
      </Typography.Title>
      <Form layout="vertical" style={{ maxWidth: 600, marginBottom: 24 }}>
        <Form.Item label="Store name" required>
          <Input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="e.g. Beverly Hills"
            disabled={loading}
          />
        </Form.Item>
        <Form.Item label="Phone number">
          <Input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="e.g. 9150 0190"
            disabled={loading}
          />
        </Form.Item>
        <Form.Item label="Store address">
          <Input
            value={storeAddress}
            onChange={(e) => setStoreAddress(e.target.value)}
            placeholder="e.g. 22-26 Tooronga TCE"
            disabled={loading}
          />
        </Form.Item>
        <Form.Item label="ABN">
          <Input
            value={abnNumber}
            onChange={(e) => setAbnNumber(e.target.value)}
            placeholder="e.g. 20619331547"
            disabled={loading}
          />
        </Form.Item>
      </Form>

      <Space>
        <Button type="primary" onClick={save} loading={saving} disabled={loading}>
          Save
        </Button>
        <Button onClick={load} disabled={loading}>
          Reload
        </Button>
      </Space>
    </div>
  );
}
