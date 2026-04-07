import { useState, useEffect, useCallback } from 'react';
import { Table, Button, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  role: string;
  createdAt: string;
}

export function CustomerManagementPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  const fetchUsers = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const res = (await apiClient.get('/admin/users', { params: { page, pageSize } })) as {
        items?: any[];
        total?: number;
      };
      const list = res?.items ?? [];
      setData(
        list.map((u: any) => ({
          id: u.id,
          name: u.name ?? '',
          email: u.email ?? '',
          phoneNumber: u.phoneNumber ?? '',
          role: u.role ?? 'Customer',
          createdAt: u.createdAt,
        }))
      );
      setPagination((p) => ({ ...p, current: page, pageSize, total: res?.total ?? 0 }));
    } catch {
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(pagination.current, pagination.pageSize);
  }, []);

  const columns: ColumnsType<CustomerRow> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 120 },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber', width: 140 },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (v: string) => (v === 'Admin' ? 'Admin' : 'Customer'),
    },
    {
      title: 'Registered',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: 'Actions',
      key: 'action',
      width: 120,
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => navigate(`/admin/customers/${r.id}`)}>
          View orders
        </Button>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Customer Management</h2>
      <Table<CustomerRow>
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
            fetchUsers(page, pageSize ?? 10);
          },
        }}
      />
    </div>
  );
}
