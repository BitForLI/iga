import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Table, Button, Space, Image, message, Switch, Select, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { ProductFormModal } from '../../components/admin/ProductFormModal';
import { adminProductAPI, isRequestAborted } from '../../api';
import type { Product, ProductFormValues } from '../../types/product';
import { resolveProductImageUrl } from '../../utils/imageUrl';
import productImageFallback from '../../assets/images/main.png';

const CATEGORY_FILTER_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'Special', label: 'Special' },
  { value: 'Fruit', label: 'Fruit' },
  { value: 'Vegetables', label: 'Vegetables' },
  { value: 'Grocery', label: 'Grocery' },
  { value: 'Frozen', label: 'Frozen' },
  { value: 'Drink', label: 'Drink' },
  { value: 'Dairy', label: 'Dairy' },
  { value: 'Meat', label: 'Meat' },
  { value: 'Bakery', label: 'Bakery' },
  { value: 'Pantry', label: 'Pantry' },
];

/** Mock 数据：当 API 不可用时展示 */
const MOCK_PRODUCTS: Product[] = [
  { id: 1, name: 'Fresh Eggs', imageUrl: '', category: 'Dairy', price: 5.99, costPrice: 3.5, unit: 'dozen', isActive: true },
  { id: 2, name: 'Organic Apple', imageUrl: '', category: 'Fruit', price: 3.49, costPrice: 2.0, unit: 'kg', isActive: true },
  { id: 3, name: 'Tomato', imageUrl: '', category: 'Vegetables', price: 2.99, costPrice: 1.2, unit: 'kg', isActive: false },
];

export function ProductManagementPage() {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [useMock, setUseMock] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchText, setSearchText] = useState('');
  /** 取消上一次列表请求，避免「先返回未筛选、后返回已筛选」被旧结果覆盖 */
  const listFetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setSearchText(searchInput.trim()), 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  const normalizeProducts = (list: unknown[]): Product[] => {
    return list.map((p: any) => ({
      id: p.id ?? p.Id,
      name: p.name ?? p.Name ?? '',
      imageUrl: p.imageUrl ?? p.ImageUrl ?? '',
      category: p.category ?? p.Category ?? '',
      price: Number(p.price ?? p.Price ?? 0),
      costPrice: Number(p.costPrice ?? p.CostPrice ?? 0) || undefined,
      unit: p.unit ?? p.Unit ?? '',
      isActive: p.isActive ?? p.IsActive ?? true,
      isWeighingRequired: p.isWeighingRequired ?? p.IsWeighingRequired ?? false,
      defaultExpectedWeightKg:
        p.defaultExpectedWeightKg != null || p.DefaultExpectedWeightKg != null
          ? Number(p.defaultExpectedWeightKg ?? p.DefaultExpectedWeightKg ?? 0)
          : undefined,
    }));
  };

  const fetchProducts = useCallback(
    async (page = 1, pageSize = 10) => {
      listFetchAbortRef.current?.abort();
      const ac = new AbortController();
      listFetchAbortRef.current = ac;
      setLoading(true);
      try {
        const res = (await adminProductAPI.getList(
          page,
          pageSize,
          {
            category: categoryFilter || undefined,
            search: searchText || undefined,
          },
          { signal: ac.signal }
        )) as { items?: any[]; total?: number } | undefined;
        const list = Array.isArray(res?.items) ? res.items : [];
        const total = res?.total ?? list.length;
        setData(normalizeProducts(list));
        setPagination((p) => ({ ...p, current: page, pageSize, total }));
        setUseMock(false);
      } catch (e) {
        if (isRequestAborted(e)) return;
        const detail = e instanceof Error ? e.message : String(e);
        message.warning(`无法加载商品：${detail}（已显示示例数据）`);
        setData(MOCK_PRODUCTS);
        setPagination((p) => ({ ...p, current: 1, total: MOCK_PRODUCTS.length }));
        setUseMock(true);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [categoryFilter, searchText]
  );

  useEffect(() => {
    fetchProducts(1, pagination.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 分类/搜索变化回到第 1 页；mock 时也会重试 API
  }, [categoryFilter, searchText, fetchProducts]);

  /** 计算利润率：(卖价 - 成本价) / 卖价 * 100%，卖价为0时返回 '-' */
  const getProfitMargin = (price: number, costPrice?: number): string => {
    if (price <= 0 || costPrice == null) return '-';
    const margin = ((price - costPrice) / price) * 100;
    return `${margin.toFixed(1)}%`;
  };

  const mockFilteredSorted = useMemo(() => {
    let list = [...MOCK_PRODUCTS];
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return list;
  }, [categoryFilter, searchText]);

  useEffect(() => {
    if (!useMock) return;
    setPagination((p) => ({ ...p, current: 1, total: mockFilteredSorted.length }));
  }, [categoryFilter, searchText, useMock, mockFilteredSorted.length]);

  /** 使用 Table 的 onChange 处理分页（antd 中仅配 pagination.onChange 可能不触发或参数不全） */
  const handleTableChange: TableProps<Product>['onChange'] = (pag) => {
    const current = pag?.current ?? 1;
    const pageSize = pag?.pageSize ?? pagination.pageSize;
    if (!useMock) {
      void fetchProducts(current, pageSize);
    } else {
      setPagination((p) => ({
        ...p,
        current,
        pageSize,
        total: mockFilteredSorted.length,
      }));
    }
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const handleEdit = async (record: Product) => {
    try {
      const raw = await adminProductAPI.getById(record.id);
      setEditingProduct(normalizeProducts([raw as object])[0]);
    } catch {
      setEditingProduct(record);
    }
    setModalOpen(true);
  };

  const [submitLoading, setSubmitLoading] = useState(false);

  const handleSubmit = async (values: ProductFormValues) => {
    setSubmitLoading(true);
    try {
      const payload = { ...values, imageUrl: values.imageUrl ?? '' };
      if (editingProduct) {
        await adminProductAPI.update(editingProduct.id, { ...payload, id: editingProduct.id });
        message.success('Product updated');
      } else {
        await adminProductAPI.create(payload);
        message.success('Product added');
      }
      setModalOpen(false);
      setEditingProduct(null);
      fetchProducts(pagination.current, pagination.pageSize);
    } catch (e) {
      message.error((e as Error).message);
      throw e;
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleModalCancel = () => {
    setModalOpen(false);
    setEditingProduct(null);
  };

  const handleToggleStatus = async (record: Product) => {
    try {
      await adminProductAPI.toggleStatus(record.id);
      message.success(record.isActive ? 'Product deactivated' : 'Product activated');
      fetchProducts(pagination.current, pagination.pageSize);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns: ColumnsType<Product> = [
    {
      title: 'Image',
      dataIndex: 'imageUrl',
      key: 'imageUrl',
      width: 80,
      render: (url: string) =>
        url ? (
          <Image
            src={resolveProductImageUrl(url, productImageFallback)}
            alt=""
            width={48}
            height={48}
            style={{ objectFit: 'cover', borderRadius: 4 }}
          />
        ) : (
          <div style={{ width: 48, height: 48, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#999' }}>No image</div>
        ),
    },
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 120 },
    {
      title: 'Price',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (v: number, r) => `$${Number(v).toFixed(2)}/${r.unit || ''}`,
    },
    {
      title: 'Cost',
      dataIndex: 'costPrice',
      key: 'costPrice',
      width: 90,
      render: (v: number) => (v != null && v > 0 ? `$${Number(v).toFixed(2)}` : '-'),
    },
    {
      title: 'Margin',
      key: 'profitMargin',
      width: 90,
      render: (_: unknown, r: Product) => (
        <span style={{ color: Number(r.costPrice) > 0 ? '#dc2626' : '#999' }}>
          {getProfitMargin(r.price, r.costPrice)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (v: boolean, record: Product) => (
        <Switch
          checked={v}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
          onChange={() => handleToggleStatus(record)}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, background: '#fff', minHeight: '100vh' }}>
      <Space wrap style={{ marginBottom: 16 }} align="center">
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Add product
        </Button>
        <Select
          style={{ width: 200 }}
          options={CATEGORY_FILTER_OPTIONS}
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(v)}
          placeholder="Category"
        />
        <Input.Search
          allowClear
          placeholder="Search by name"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ width: 280 }}
        />
      </Space>
      <Table<Product>
        rowKey="id"
        columns={columns}
        dataSource={
          useMock
            ? mockFilteredSorted.slice(
                (pagination.current - 1) * pagination.pageSize,
                pagination.current * pagination.pageSize
              )
            : data
        }
        loading={loading}
        onChange={handleTableChange}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: useMock ? mockFilteredSorted.length : pagination.total,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} items`,
        }}
      />
      <ProductFormModal
        open={modalOpen}
        mode={editingProduct ? 'edit' : 'add'}
        initialData={editingProduct}
        loading={submitLoading}
        onClose={handleModalCancel}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
