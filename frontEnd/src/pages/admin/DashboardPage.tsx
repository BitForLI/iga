import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Spin, message } from 'antd';
import { DollarOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { apiClient } from '../../api/client';

interface DashboardStats {
  todaySales: number;
  pendingOrderCount: number;
}

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = (await apiClient.get('/admin/dashboard')) as DashboardStats;
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) {
          message.warning('Failed to load dashboard data');
          setStats({
            todaySales: 0,
            pendingOrderCount: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Dashboard</h2>
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Today's Sales"
              value={stats?.todaySales ?? 0}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#dc2626' }}
            />
            <DollarOutlined style={{ fontSize: 48, color: '#dc2626', opacity: 0.3, float: 'right', marginTop: -40 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Pending Orders"
              value={stats?.pendingOrderCount ?? 0}
              valueStyle={{ color: '#dc2626' }}
            />
            <ShoppingCartOutlined style={{ fontSize: 48, color: '#dc2626', opacity: 0.3, float: 'right', marginTop: -40 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
