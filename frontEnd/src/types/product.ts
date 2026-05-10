/** 商品类型，与后端 Product 模型对应（后台含 costPrice） */
export interface Product {
  id: number;
  name: string;
  imageUrl?: string;
  category: string;
  price: number;
  costPrice?: number; // 成本价，仅后台可见
  unit: string;
  isActive: boolean;
  isWeighingRequired?: boolean;
}

/** 商品表单值（新增/编辑） */
export interface ProductFormValues {
  name: string;
  imageUrl: string;
  category: string;
  price: number;
  costPrice?: number;
  unit: string;
  isActive: boolean;
  isWeighingRequired: boolean;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
