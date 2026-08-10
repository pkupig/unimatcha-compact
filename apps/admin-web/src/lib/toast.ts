import toast from 'react-hot-toast';
import { ApiError } from './api/client';

/** 唯一的错误提示模式：catch 里一律 toastError(e)，禁止各页自编兜底文案 */
export function toastError(e: unknown, fallback = '操作失败，请稍后重试'): void {
  toast.error(e instanceof ApiError ? e.message : fallback);
}
