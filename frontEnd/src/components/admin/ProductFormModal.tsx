import { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Switch, Upload, message, Space, Button } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { UploadFile } from 'antd/es/upload/interface';
import type { Product, ProductFormValues, ProductUnitPriceOption } from '../../types/product';
import { adminProductAPI } from '../../api';
import { resolveProductImageUrl } from '../../utils/imageUrl';
import productImage from '../../assets/images/main.png';

const CATEGORY_OPTIONS = [
  { value: 'Special', label: 'Special' },
  { value: 'Recommended', label: 'Recommended' },
  { value: 'Fruit', label: 'Fruit' },
  { value: 'Vegetables', label: 'Vegetables' },
  { value: 'Grocery', label: 'Grocery' },
  { value: 'Frozen', label: 'Frozen' },
  { value: 'Drink', label: 'Drink' },
  { value: 'Dairy', label: 'Dairy' },
  { value: 'Meat', label: 'Meat' },
  { value: 'Seafood', label: 'Seafood' },
  { value: 'Bakery', label: 'Bakery' },
  { value: 'Pantry', label: 'Pantry' },
];

const UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'ea', label: 'ea' },
  { value: 'box', label: 'box' },
  { value: 'half-box', label: 'half-box' },
];

function parseUnitPriceOptions(raw: string | undefined, fallbackUnit: string, fallbackPrice: number): ProductUnitPriceOption[] {
  if (raw?.trim()) {
    try {
      const parsed = JSON.parse(raw) as Array<{ unit?: string; price?: number }>;
      const options = Array.isArray(parsed)
        ? parsed
            .map((x) => ({ unit: String(x.unit ?? '').trim(), price: Number(x.price ?? 0) }))
            .filter((x) => x.unit && Number.isFinite(x.price) && x.price > 0)
        : [];
      if (options.length > 0) return options;
    } catch {
      /* ignore */
    }
  }
  return [{ unit: fallbackUnit || 'ea', price: Number.isFinite(fallbackPrice) ? fallbackPrice : 0 }];
}

interface ProductFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initialData?: Product | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

function applyProductToForm(form: FormInstance<ProductFormValues>, data: Product) {
  const unitPriceOptions =
    data.unitPriceOptions && data.unitPriceOptions.length > 0
      ? data.unitPriceOptions
      : parseUnitPriceOptions(data.unitPriceOptionsJson, data.unit, Number(data.price));
  const first = unitPriceOptions[0] ?? { unit: data.unit || 'ea', price: Number(data.price) || 0 };
  const hasKg = unitPriceOptions.some((x) => x.unit.toLowerCase() === 'kg');
  form.setFieldsValue({
    name: data.name,
    imageUrl: data.imageUrl ?? '',
    category: data.category,
    price: Number(first.price),
    costPrice: data.costPrice != null ? Number(data.costPrice) : undefined,
    unit: first.unit,
    unitPriceOptions,
    isActive: data.isActive,
    isWeighingRequired: hasKg,
    defaultExpectedWeightKg:
      data.defaultExpectedWeightKg != null && data.defaultExpectedWeightKg > 0
        ? Number(data.defaultExpectedWeightKg)
        : hasKg
          ? 1
          : undefined,
  });
}

export function ProductFormModal({
  open,
  mode,
  initialData,
  loading = false,
  onClose,
  onSubmit,
}: ProductFormModalProps) {
  const [form] = Form.useForm<ProductFormValues>();
  const [imageFileList, setImageFileList] = useState<UploadFile[]>([]);
  const [draftUnit, setDraftUnit] = useState<string>('ea');
  const [draftPrice, setDraftPrice] = useState<number | null>(null);
  const unitPriceOptionsWatch = (Form.useWatch('unitPriceOptions', form) as ProductUnitPriceOption[] | undefined) ?? [];
  const kgWatch = Form.useWatch('defaultExpectedWeightKg', form);
  const kgUnitPrice = unitPriceOptionsWatch.find((x) => x?.unit?.toLowerCase() === 'kg')?.price ?? 0;
  const hasKgUnit = unitPriceOptionsWatch.some((x) => x?.unit?.toLowerCase() === 'kg');

  const syncImageFileListFromUrl = (url: string | undefined) => {
    if (!url?.trim()) {
      setImageFileList([]);
      return;
    }
    setImageFileList([
      {
        uid: '-1',
        name: 'image',
        status: 'done',
        url: resolveProductImageUrl(url, productImage),
      },
    ]);
  };

  const categoryOptions = useMemo(() => {
    const opts = [...CATEGORY_OPTIONS];
    const c = initialData?.category?.trim();
    if (c && !opts.some((o) => o.value === c)) {
      opts.unshift({ value: c, label: c });
    }
    return opts;
  }, [initialData?.category]);

  const unitOptions = UNIT_OPTIONS;

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialData) {
      applyProductToForm(form, initialData);
      syncImageFileListFromUrl(initialData.imageUrl);
      setDraftUnit('ea');
      setDraftPrice(null);
    } else {
      form.resetFields();
      form.setFieldsValue({
        isActive: true,
        isWeighingRequired: false,
        unitPriceOptions: [],
      });
      setImageFileList([]);
      setDraftUnit('ea');
      setDraftPrice(null);
    }
  }, [open, mode, initialData, form]);

  useEffect(() => {
    if (!open || !hasKgUnit) return;
    const cur = form.getFieldValue('defaultExpectedWeightKg');
    if (cur == null || cur === '' || !(Number(cur) > 0)) {
      form.setFieldsValue({ defaultExpectedWeightKg: 1 });
    }
  }, [open, hasKgUnit, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const normalizedUnitOptions = (values.unitPriceOptions ?? [])
        .map((x) => ({ unit: String(x.unit ?? '').trim(), price: Number(x.price ?? 0) }))
        .filter((x) => x.unit && Number.isFinite(x.price) && x.price > 0)
        .filter((x, idx, arr) => arr.findIndex((y) => y.unit.toLowerCase() === x.unit.toLowerCase()) === idx);
      if (normalizedUnitOptions.length === 0) {
        message.error('Please add at least one unit with a valid price');
        return;
      }
      const first = normalizedUnitOptions[0];
      const hasKg = normalizedUnitOptions.some((x) => x.unit.toLowerCase() === 'kg');
      await onSubmit({
        ...values,
        unitPriceOptions: normalizedUnitOptions,
        unitPriceOptionsJson: JSON.stringify(normalizedUnitOptions),
        unit: first.unit,
        price: first.price,
        isWeighingRequired: hasKg,
        defaultExpectedWeightKg: hasKg ? values.defaultExpectedWeightKg : 0,
      });
      form.resetFields();
      onClose();
    } catch (err) {
      // 校验失败或提交失败，不关闭
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setDraftUnit('ea');
    setDraftPrice(null);
    onClose();
  };

  const handleAddUnitPrice = () => {
    const price = Number(draftPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) {
      message.error('Please enter a valid price');
      return;
    }

    const current = (form.getFieldValue('unitPriceOptions') as ProductUnitPriceOption[] | undefined) ?? [];
    const next = [...current];
    const idx = next.findIndex((x) => x.unit.toLowerCase() === draftUnit.toLowerCase());
    const row = { unit: draftUnit, price: Math.round(price * 100) / 100 };
    if (idx >= 0) {
      next[idx] = row;
    } else {
      next.push(row);
    }
    form.setFieldValue('unitPriceOptions', next);
    setDraftPrice(null);
  };

  const handleRemoveUnitPrice = (unit: string) => {
    const current = (form.getFieldValue('unitPriceOptions') as ProductUnitPriceOption[] | undefined) ?? [];
    form.setFieldValue(
      'unitPriceOptions',
      current.filter((x) => x.unit.toLowerCase() !== unit.toLowerCase())
    );
  };

  return (
    <Modal
      title={mode === 'add' ? 'Add Product' : 'Edit Product'}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      destroyOnClose
      width={520}
      okText="OK"
      cancelText="Cancel"
      afterOpenChange={(visible) => {
        if (!visible) return;
        if (mode === 'edit' && initialData) {
          requestAnimationFrame(() => {
            applyProductToForm(form, initialData);
            syncImageFileListFromUrl(initialData.imageUrl);
          });
        }
      }}
    >
      <Form
        key={mode === 'edit' && initialData ? `edit-${initialData.id}` : 'add'}
        form={form}
        layout="vertical"
        preserve
        initialValues={{
          isActive: true,
          isWeighingRequired: false,
        }}
      >
        <Form.Item
          name="name"
          label="Product name"
          rules={[{ required: true, message: 'Please enter product name' }]}
        >
          <Input placeholder="Enter product name" />
        </Form.Item>

        <Form.Item label="Product image">
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            <Upload
              listType="picture-card"
              maxCount={1}
              accept="image/jpeg,image/png,image/gif,image/webp"
              fileList={imageFileList}
              onChange={({ fileList }) => {
                setImageFileList(fileList);
                if (fileList.length === 0) form.setFieldValue('imageUrl', '');
              }}
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  const { url } = await adminProductAPI.uploadProductImage(file as File);
                  form.setFieldValue('imageUrl', url);
                  setImageFileList([
                    {
                      uid: '-1',
                      name: (file as File).name,
                      status: 'done',
                      url: resolveProductImageUrl(url, productImage),
                    },
                  ]);
                  onSuccess?.(url);
                  message.success('Image uploaded');
                } catch (e) {
                  onError?.(e as Error);
                  message.error((e as Error).message);
                }
              }}
            >
              {imageFileList.length < 1 ? <span style={{ fontSize: 13 }}>Upload</span> : null}
            </Upload>
            <Form.Item name="imageUrl" noStyle>
              <Input placeholder="Or paste image URL (optional)" />
            </Form.Item>
          </Space>
        </Form.Item>

        <Form.Item
          name="category"
          label="Category"
          rules={[{ required: true, message: 'Please select category' }]}
        >
          <Select
            placeholder="Select category"
            options={categoryOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Units and prices</div>
          <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
            <InputNumber
              min={0.01}
              step={0.01}
              precision={2}
              prefix="$"
              value={draftPrice as number | null}
              onChange={(v) => setDraftPrice(v == null ? null : Number(v))}
              placeholder="Price"
              style={{ width: '45%' }}
            />
            <Select
              value={draftUnit}
              onChange={setDraftUnit}
              options={unitOptions}
              style={{ width: '35%' }}
            />
            <Button type="primary" onClick={handleAddUnitPrice} style={{ width: '20%' }}>
              Add
            </Button>
          </Space.Compact>

          {unitPriceOptionsWatch.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 12 }}>No unit-price bindings yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unitPriceOptionsWatch.map((x) => (
                <div
                  key={x.unit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '6px 10px',
                  }}
                >
                  <span>${Number(x.price).toFixed(2)} / {x.unit}</span>
                  <Button type="text" danger onClick={() => handleRemoveUnitPrice(x.unit)}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Form.Item name="costPrice" label="Cost price (admin only)">
          <InputNumber
            min={0}
            step={0.01}
            precision={2}
            style={{ width: '100%' }}
            placeholder="Enter cost price for margin calculation"
            prefix="$"
          />
        </Form.Item>

        <Form.Item name="isActive" label="Status" valuePropName="checked">
          <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
        </Form.Item>

        {hasKgUnit ? (
          <>
            <Form.Item
              name="defaultExpectedWeightKg"
              label="Default estimated weight (kg)"
              rules={[{ required: true, message: 'Enter estimated weight' }]}
            >
              <InputNumber min={0.01} step={0.05} precision={3} style={{ width: '100%' }} placeholder="e.g. 1.0" />
            </Form.Item>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>
              Estimated total at default weight:{' '}
              <strong style={{ color: '#dc2626' }}>
                $
                {(() => {
                  const price = Number(kgUnitPrice ?? 0);
                  const kg = Number(kgWatch ?? 0);
                  const est = Number.isFinite(price) && Number.isFinite(kg) ? price * kg : 0;
                  return est.toFixed(2);
                })()}
              </strong>
            </div>
          </>
        ) : null}
      </Form>
    </Modal>
  );
}
