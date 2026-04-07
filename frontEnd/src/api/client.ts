import axios from 'axios';
import { API_BASE } from '../config/apiEnv';

export { API_BASE };

/** 带 HTTP 状态与原始响应体，便于控制台 / 调试（400 时请看 apiData.error） */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly apiData?: unknown
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 可添加 token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const rawUser = localStorage.getItem('user');
  if (rawUser) {
    try {
      const u = JSON.parse(rawUser) as { id?: number };
      if (u?.id != null) {
        config.headers['X-User-Id'] = String(u.id);
      }
    } catch {
      /* ignore */
    }
  }
  return config;
});

// 响应拦截器 - 统一错误处理（必须保留取消/中断类错误，否则 AbortController 会被误判成「网络失败」）
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    const ax = error as { code?: string; name?: string };
    if (
      ax?.code === 'ERR_CANCELED' ||
      ax?.name === 'CanceledError' ||
      ax?.name === 'AbortError'
    ) {
      return Promise.reject(error);
    }
    const status = error.response?.status;
    const data = error.response?.data;
    const o = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
    let extracted =
      (typeof data === 'string' ? data : null) ||
      (o && typeof o.error === 'string' ? o.error : null) ||
      (o && typeof o.message === 'string' ? o.message : null) ||
      (o && typeof o.detail === 'string' ? o.detail : null) ||
      (o && typeof o.title === 'string' ? o.title : null) ||
      error.message;
    if (!extracted && o?.errors != null) {
      try {
        extracted = JSON.stringify(o.errors);
      } catch {
        extracted = 'Validation error';
      }
    }
    const message = extracted || 'Request failed';
    return Promise.reject(new ApiRequestError(message, status, data));
  }
);
