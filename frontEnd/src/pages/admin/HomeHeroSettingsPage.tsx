import { useCallback, useEffect, useState } from 'react';
import { Button, Space, Typography, Upload, message, Image } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { adminStoreAPI } from '../../api';
import { API_ORIGIN } from '../../config/apiEnv';
import { useMaxWidth } from '../../hooks/useMediaQuery';

function absUrl(path: string) {
  const p = path.trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.startsWith('/')) return `${API_ORIGIN}${p}`;
  return p;
}

export function HomeHeroSettingsPage() {
  const isNarrow = useMaxWidth(576);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = (await adminStoreAPI.getSettings()) as { homeCarouselImageUrls?: string[] };
      setUrls(Array.isArray(raw.homeCarouselImageUrls) ? raw.homeCarouselImageUrls.filter(Boolean) : []);
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
      await adminStoreAPI.putSettings({ homeCarouselImageUrls: urls });
      message.success('Saved');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const uploadProps = {
    showUploadList: false,
    maxCount: 1,
    beforeUpload: async (file: File) => {
      try {
        const { url } = await adminStoreAPI.uploadCarouselImage(file);
        setUrls((prev) => [...prev, url].slice(0, 6));
        message.success('Image uploaded');
      } catch (e) {
        message.error((e as Error).message);
      }
      return false;
    },
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Home hero carousel
      </Typography.Title>
      <Space wrap style={{ marginBottom: 16, width: '100%' }}>
        <Upload {...uploadProps} accept="image/*">
          <Button icon={<PlusOutlined />} loading={loading}>
            Upload image
          </Button>
        </Upload>
        <Button type="primary" onClick={save} loading={saving} disabled={loading}>
          Save
        </Button>
        <Button onClick={load} disabled={loading}>
          Reload
        </Button>
      </Space>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, width: '100%' }}>
        {urls.map((u, i) => (
          <div
            key={`${u}-${i}`}
            style={{
              display: 'flex',
              flexDirection: isNarrow ? 'column' : 'row',
              alignItems: isNarrow ? 'stretch' : 'center',
              gap: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 8,
              background: '#fafafa',
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            <Image
              src={absUrl(u)}
              alt=""
              width={isNarrow ? undefined : 160}
              style={{
                width: isNarrow ? '100%' : 160,
                maxWidth: '100%',
                height: isNarrow ? 160 : undefined,
                objectFit: 'cover',
                borderRadius: 4,
              }}
            />
            <Typography.Text code copyable style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
              {u}
            </Typography.Text>
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              style={{ alignSelf: isNarrow ? 'flex-end' : 'center' }}
              onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {urls.length === 0 && !loading && (
          <Typography.Text type="secondary">
            No images yet — the home page will not show a hero carousel until you upload and save at least one.
          </Typography.Text>
        )}
      </div>
    </div>
  );
}
