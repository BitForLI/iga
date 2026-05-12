import { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Switch, Upload, message, Space } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { UploadFile } from 'antd/es/upload/interface';
import type { Product, ProductFormValues } from '../../types/product';
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
  { value: 'Bakery', label: 'Bakery' },
  { value: 'Pantry', label: 'Pantry' },
];

const UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'ea', label: 'ea' },
  { value: 'box', label: 'box' },
  { value: 'dozen', label: 'dozen' },
  { value: 'bunch', label: 'bunch' },
  { value: 'loaf', label: 'loaf' },
  { value: '2L', label: '2L' },
  { value: '500g', label: '500g' },
  { value: '1kg', label: '1kg' },
  { value: '175g', label: '175g' },
  { value: '200g', label: '200g' },
  { value: '250g', label: '250g' },
  { value: '365g', label: '365g' },
  { value: '700g', label: '700g' },
];

interface ProductFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  initialData?: Product | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
}

function applyProductToForm(form: FormInstance<ProductFormValues>, data: Product) {
  form.setFieldsValue({
    name: data.name,
    imageUrl: data.imageUrl ?? '',
    category: data.category,
    price: Number(data.price),
    costPrice: data.costPrice != null ? Number(data.costPrice) : undefined,
    unit: data.unit,
    isActive: data.isActive,
    isWeighingRequired: data.isWeighingRequired ?? false,
    defaultExpectedWeightKg:
      data.defaultExpectedWeightKg != null && data.defaultExpectedWeightKg > 0
        ? Number(data.defaultExpectedWeightKg)
        : data.isWeighingRequired
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
  const isWeighingRequiredWatch = Form.useWatch('isWeighingRequired', form);
  const priceWatch = Form.useWatch('price', form);
  const kgWatch = Form.useWatch('defaultExpectedWeightKg', form);

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

  const unitOptions = useMemo(() => {
    const opts = [...UNIT_OPTIONS];
    const u = initialData?.unit?.trim();
    if (u && !opts.some((o) => o.value === u)) {
      opts.unshift({ value: u, label: u });
    }
    return opts;
  }, [initialData?.unit]);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialData) {
      applyProductToForm(form, initialData);
      syncImageFileListFromUrl(initialData.imageUrl);
    } else {
      form.resetFields();
      form.setFieldsValue({
        isActive: true,
        isWeighingRequired: false,
      });
      setImageFileList([]);
    }
  }, [open, mode, initialData, form]);

  useEffect(() => {
    if (!open || !isWeighingRequiredWatch) return;
    const cur = form.getFieldValue('defaultExpectedWeightKg');
    if (cur == null || cur === '' || !(Number(cur) > 0)) {
      form.setFieldsValue({ defaultExpectedWeightKg: 1 });
    }
  }, [open, isWeighingRequiredWatch, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit({
        ...values,
        defaultExpectedWeightKg: values.isWeighingRequired ? values.defaultExpectedWeightKg : 0,
      });
      form.resetFields();
      onClose();
    } catch (err) {
      // 校验失败或提交失败，不关闭
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
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

        <Form.Item
          name="price"
          label="Price"
          rules={[{ required: true, message: 'Please enter price' }]}
        >
          <InputNumber
            min={0}
            step={0.01}
            precision={2}
            style={{ width: '100%' }}
            placeholder="Enter price"
            prefix="$"
          />
        </Form.Item>

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

        <Form.Item
          name="unit"
          label="Unit"
          rules={[{ required: true, message: 'Please select unit' }]}
        >
          <Select
            placeholder="Select unit"
            options={unitOptions}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Form.Item name="isActive" label="Status" valuePropName="checked">
          <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
        </Form.Item>

        <Form.Item name="isWeighingRequired" label="Weighing required" valuePropName="checked">
          <Switch checkedChildren="Yes" unCheckedChildren="No" />
        </Form.Item>

        {isWeighingRequiredWatch ? (
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
                  const price = Number(priceWatch ?? 0);
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
