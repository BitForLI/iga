import axios from 'axios';
import { apiClient, API_BASE, ApiRequestError } from './client';

export { ApiRequestError };

// Axios' static response type cannot see that client.ts unwraps response.data.
// Keep that implementation detail in one place so API consumers receive the
// actual JSON payload type instead of repeatedly casting AxiosResponse values.
function responseData<T>(request: Promise<unknown>): Promise<T> {
  return request as Promise<T>;
}

export interface AuthLoginResponse {
  token: string;
  expiresAtUtc: string;
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  role: string;
}

export interface OrderCreateRequest {
  orderType: 'Pickup' | 'Delivery';
  pickupTime?: string;
  deliveryAddress?: string;
  deliverySuburb?: string;
  items: Array<{
    productId: number;
    quantity: number;
    expectedWeight: number;
    selectedUnit?: string;
  }>;
}

const ORDER_CREATE_REQUEST_KEY = 'iga_pending_order_create';

async function orderRequestFingerprint(data: OrderCreateRequest): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateOrderRequestId(data: OrderCreateRequest): Promise<string> {
  const fingerprint = await orderRequestFingerprint(data);
  try {
    const raw = sessionStorage.getItem(ORDER_CREATE_REQUEST_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as { fingerprint?: string; requestId?: string; expiresAt?: number };
      if (stored.fingerprint === fingerprint && stored.requestId && Number(stored.expiresAt) > Date.now()) {
        return stored.requestId;
      }
    }
  } catch {
    // A blocked or malformed sessionStorage entry must not stop checkout.
  }

  const requestId = crypto.randomUUID();
  try {
    sessionStorage.setItem(
      ORDER_CREATE_REQUEST_KEY,
      JSON.stringify({ fingerprint, requestId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
    );
  } catch {
    // The request still carries an idempotency key for in-flight network retries.
  }
  return requestId;
}

export function clearPendingOrderCreate(): void {
  try {
    sessionStorage.removeItem(ORDER_CREATE_REQUEST_KEY);
  } catch {
    // Ignore storage failures after payment completion.
  }
}

/** axios 取消请求（AbortController）；需与 client 拦截器配合，勿把取消错误包成普通 Error */
export function isRequestAborted(err: unknown): boolean {
  if (typeof axios.isCancel === 'function' && axios.isCancel(err)) return true;
  const e = err as { code?: string; name?: string; message?: string } | undefined;
  if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError')
    return true;
  const m = (e?.message ?? '').toLowerCase();
  if (m.includes('canceled') || m.includes('cancelled') || m === 'aborted') return true;
  return false;
}

/** 与 ASP.NET System.Text.Json 默认 camelCase 一致，避免注册/登录字段绑定失败 */
export const authAPI = {
  register: (data: { name: string; email: string; password: string }) =>
    apiClient.post<{ message: string; emailSent: boolean; email: string }>('/auth/register', data),
  verifyEmail: (data: { email: string; code: string }) =>
    apiClient.post<{ message: string }>('/auth/verify-email', data),
  resendVerification: (data: { email: string }) =>
    apiClient.post<{ emailSent: boolean; message: string }>('/auth/resend-verification', data),
  login: (data: { email: string; password: string }) =>
    responseData<AuthLoginResponse>(apiClient.post('/auth/login', data)),
  me: () => responseData<{ id: number; name: string; email: string; phoneNumber: string; role: string }>(apiClient.get('/auth/me')),
  forgotPassword: (data: { email: string }) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', data),
  resendPasswordReset: (data: { email: string }) =>
    apiClient.post<{ message: string }>('/auth/resend-password-reset', data),
  resetPasswordWithCode: (data: { email: string; code: string; newPassword: string }) =>
    apiClient.post<{ message: string }>('/auth/reset-password', data),
};

export interface ProductAPIItem {
  [key: string]: unknown;
  id: number;
  name: string;
  price: number;
  category: string;
  unit: string;
}

export const productAPI = {
  list: () => responseData<ProductAPIItem[]>(apiClient.get('/product')),
  create: (data: unknown) => responseData<unknown>(apiClient.post('/product', data)),
  update: (id: number, data: unknown) => responseData<unknown>(apiClient.put(`/product/${id}`, data)),
  get: (id: number) => responseData<unknown>(apiClient.get(`/product/${id}`)),
};

export const storePublicAPI = {
  getPublicSettings: () => apiClient.get<unknown>('/store/public-settings'),
};

export const adminStoreAPI = {
  getSettings: () => apiClient.get<unknown>('/admin/store/settings'),
  putSettings: (body: {
    storeName?: string;
    phoneNumber?: string;
    storeAddress?: string;
    abnNumber?: string;
    deliveryZoneFees?: { suburb: string; feeAud: number; enabled?: boolean }[];
    deliveryFeeRules?: { minAmount: number; feeAud: number }[];
    homeCarouselImageUrls?: string[];
  }) => apiClient.put<{ message?: string }>('/admin/store/settings', body),
  uploadCarouselImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = sessionStorage.getItem('iga_auth_token');
    const res = await fetch(`${API_BASE}/admin/store/upload-carousel-image`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; url?: string };
    if (!res.ok) {
      throw new Error(data.error || data.message || res.statusText || 'Upload failed');
    }
    if (!data.url) throw new Error('Invalid upload response');
    return { url: data.url };
  },
};

export const adminProductAPI = {
  getList: (
    page = 1,
    pageSize = 10,
    opts?: { category?: string; search?: string },
    requestConfig?: { signal?: AbortSignal }
  ) => {
    const cat = opts?.category?.trim();
    const q = opts?.search?.trim();
    return responseData<{ items: unknown[]; total: number; page: number; pageSize: number }>(
      apiClient.get('/admin/products', {
        params: {
          page,
          pageSize,
          ...(cat ? { category: cat } : {}),
          ...(q ? { search: q } : {}),
        },
        ...requestConfig,
      })
    );
  },
  /** 编辑前拉取完整商品（含 costPrice） */
  getById: (id: number) => responseData<unknown>(apiClient.get(`/admin/products/${id}`)),
  /** 上传商品图到数据库，返回 { url: "/api/product/image/{id}" } */
  uploadProductImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = sessionStorage.getItem('iga_auth_token');
    const res = await fetch(`${API_BASE}/admin/products/upload-image`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; url?: string };
    if (!res.ok) {
      throw new Error(data.error || data.message || res.statusText || 'Upload failed');
    }
    if (!data.url) throw new Error('Invalid upload response');
    return { url: data.url };
  },
  create: (data: unknown) => responseData<unknown>(apiClient.post('/product', data)),
  update: (id: number, data: unknown) => responseData<unknown>(apiClient.put(`/product/${id}`, data)),
  delete: (id: number) => apiClient.delete(`/product/${id}`),
  toggleStatus: (id: number) => apiClient.patch(`/product/${id}/toggle-status`),
};

export const orderAPI = {
  create: async (data: OrderCreateRequest) => {
    const clientRequestId = await getOrCreateOrderRequestId(data);
    return responseData<{ orderId: number }>(apiClient.post('/order/create', { ...data, clientRequestId }));
  },
  get: (id: number) => responseData<unknown>(apiClient.get('/order/' + id)),
  getUserOrders: (userId: number) => responseData<unknown[]>(apiClient.get('/order/user/' + userId)),
  requestRefund: (orderId: number, body?: { reason?: string; itemIds?: number[] }) =>
    responseData<unknown>(apiClient.post('/order/' + orderId + '/refund-request', body ?? {})),
  verify: (id: number, data: { pickupCode: string }) =>
    responseData<unknown>(apiClient.post('/order/' + id + '/verify', data)),
};

export const paymentAPI = {
  createCheckout: (orderId: number) =>
    apiClient.post('/payment/create-checkout-session/' + orderId, {}),
  /** 支付成功回跳后同步订单状态（Webhook 未到 localhost 时靠此把 Pending → Paid） */
  syncOrderAfterCheckout: (orderId: number) =>
    apiClient.post<{ orderStatus: string; synced: boolean; message?: string }>(
      '/payment/sync-order-after-checkout/' + orderId,
      {}
    ),
};
