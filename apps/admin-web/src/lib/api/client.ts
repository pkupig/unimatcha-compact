/**
 * API 客户端核心（重写版）：typed fetch，取代 axios。
 * - 自动附带 Bearer token；序列化 query（跳过 undefined/null/''）
 * - 解开全局信封 {success, data, message, timestamp}，成功直接返回 data（类型化）
 * - 失败抛 ApiError（中文 message）；401 清 token 并单次触发注册的回调（SPA 跳转，不整页刷新）
 */
import { clearToken, getToken } from '../auth';

export class ApiError extends Error {
  readonly status: number; // HTTP 状态码；0 = 网络错误/超时
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const PREFIX = '/api/v1';

// 401 处理：AdminProvider 挂载时注册；一次过期只触发一次（并发 401 去重），
// 下次成功携带 token 的请求后自动复位
let unauthorizedHandler: (() => void) | null = null;
let unauthorizedFired = false;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
  if (fn === null) unauthorizedFired = false;
}

function buildQuery(query?: Query): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function statusFallback(status: number): string {
  if (status === 401) return '登录已过期，请重新登录';
  if (status === 403) return '没有权限执行此操作';
  if (status === 404) return '请求的资源不存在';
  if (status >= 500) return '服务器开小差了，请稍后重试';
  return '请求失败，请稍后重试';
}

export async function request<T>(
  path: string,
  init?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    query?: Query;
    body?: unknown;
  },
): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${PREFIX}${path}${buildQuery(init?.query)}`, {
      method: init?.method ?? 'GET',
      headers: {
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError('网络错误，请检查连接后重试', 0);
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* 非 JSON 响应按状态码兜底 */
  }

  if (!res.ok) {
    // class-validator 的 message 可能是数组
    const raw = payload?.message;
    const message = Array.isArray(raw) ? raw.join('；') : raw || statusFallback(res.status);
    // 401：清 token + 单次通知（login 请求豁免，让表单能显示「账号或密码错误」）
    if (res.status === 401 && !path.startsWith('/admin/auth/login')) {
      clearToken();
      if (!unauthorizedFired && unauthorizedHandler) {
        unauthorizedFired = true;
        unauthorizedHandler();
      }
    }
    throw new ApiError(message, res.status);
  }

  // 成功请求复位 401 去重标记（重新登录后再次过期仍可触发）
  unauthorizedFired = false;
  // 全局信封 {success, data, ...}；防御性兼容裸响应
  return (payload && payload.data !== undefined ? payload.data : payload) as T;
}

export const get = <T>(path: string, query?: Query) => request<T>(path, { query });
export const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body });
export const put = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body });
