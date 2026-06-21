import axios from 'axios';
import { apiClient, API_BASE, ApiRequestError } from './client';

export { ApiRequestError };

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
    apiClient.post<{ id: number; name: string; email: string; phoneNumber: string }>('/auth/login', data),
  forgotPassword: (data: { email: string }) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', data),
  resendPasswordReset: (data: { email: string }) =>
    apiClient.post<{ message: string }>('/auth/resend-password-reset', data),
  resetPasswordWithCode: (data: { email: string; code: string; newPassword: string }) =>
    apiClient.post<{ message: string }>('/auth/reset-password', data),
};

export const productAPI = {
  list: () => apiClient.get<any[]>('/product'),
  create: (data: any) => apiClient.post('/product', data),
  update: (id: number, data: any) => apiClient.put(`/product/${id}`, data),
  get: (id: number) => apiClient.get(`/product/${id}`),
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
    deliveryZoneFees?: { suburb: string; feeAud: number; enabled?: boolean }[];
    deliveryFeeRules?: { minAmount: number; feeAud: number }[];
    homeCarouselImageUrls?: string[];
  }) => apiClient.put<{ message?: string }>('/admin/store/settings', body),
  uploadCarouselImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    const rawUser = localStorage.getItem('user');
    let userId = '';
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser) as { id?: number };
        if (u?.id != null) userId = String(u.id);
      } catch {
        /* ignore */
      }
    }
    const res = await fetch(`${API_BASE}/admin/store/upload-carousel-image`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(userId ? { 'X-User-Id': userId } : {}),
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
    return apiClient.get<{ items: any[]; total: number; page: number; pageSize: number }>(
      '/admin/products',
      {
        params: {
          page,
          pageSize,
          ...(cat ? { category: cat } : {}),
          ...(q ? { search: q } : {}),
        },
        ...requestConfig,
      }
    );
  },
  /** 编辑前拉取完整商品（含 costPrice） */
  getById: (id: number) => apiClient.get(`/admin/products/${id}`),
  /** 上传商品图到数据库，返回 { url: "/api/product/image/{id}" } */
  uploadProductImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    const rawUser = localStorage.getItem('user');
    let userId = '';
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser) as { id?: number };
        if (u?.id != null) userId = String(u.id);
      } catch {
        /* ignore */
      }
    }
    const res = await fetch(`${API_BASE}/admin/products/upload-image`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(userId ? { 'X-User-Id': userId } : {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; url?: string };
    if (!res.ok) {
      throw new Error(data.error || data.message || res.statusText || 'Upload failed');
    }
    if (!data.url) throw new Error('Invalid upload response');
    return { url: data.url };
  },
  create: (data: any) => apiClient.post('/product', data),
  update: (id: number, data: any) => apiClient.put(`/product/${id}`, data),
  toggleStatus: (id: number) => apiClient.patch(`/product/${id}/toggle-status`),
};

export const orderAPI = {
  create: (data: any) => apiClient.post<{ orderId: number }>('/order/create', data),
  get: (id: number) => apiClient.get('/order/' + id),
  getUserOrders: (userId: number) => apiClient.get<any[]>('/order/user/' + userId),
  requestRefund: (orderId: number, body?: { reason?: string; itemIds?: number[] }) =>
    apiClient.post('/order/' + orderId + '/refund-request', body ?? {}),
  verify: (id: number, data: any) => apiClient.post('/order/' + id + '/verify', data),
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
