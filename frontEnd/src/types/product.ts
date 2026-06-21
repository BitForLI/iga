export interface ProductUnitPriceOption {
  unit: string;
  price: number;
}

/** 商品类型，与后端 Product 模型对应（后台含 costPrice） */
export interface Product {
  id: number;
  name: string;
  imageUrl?: string;
  category: string;
  price: number;
  costPrice?: number; // 成本价，仅后台可见
  unit: string;
  unitPriceOptionsJson?: string;
  unitPriceOptions?: ProductUnitPriceOption[];
  isActive: boolean;
  isWeighingRequired?: boolean;
  /** 称重商品默认预估重量（kg），用于顾客端展示与加购初值 */
  defaultExpectedWeightKg?: number;
  /** 商品描述，显示在商品卡上 */
  description?: string;
}

/** 商品表单值（新增/编辑） */
export interface ProductFormValues {
  name: string;
  imageUrl: string;
  category: string;
  price: number;
  costPrice?: number;
  unit: string;
  unitPriceOptions: ProductUnitPriceOption[];
  unitPriceOptionsJson?: string;
  isActive: boolean;
  isWeighingRequired: boolean;
  defaultExpectedWeightKg?: number;
  description?: string;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
