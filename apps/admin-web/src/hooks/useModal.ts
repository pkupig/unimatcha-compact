'use client';

import { useCallback, useState } from 'react';

/**
 * 弹窗状态（终结旧版每页 30+ useState 的病）：
 * 页面只声明 `const reject = useModal<Campaign>()`，表单字段/提交态/校验
 * 全部收进弹窗组件内部，配合 `{reject.open && <Modal .../>}` 键控重挂自重置。
 */
export interface ModalState<T> {
  open: boolean;
  /** 被操作的行数据；create 类弹窗为 null */
  data: T | null;
  openWith(data: T): void;
  openEmpty(): void;
  close(): void;
}

export function useModal<T = void>(): ModalState<T> {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<T | null>(null);

  const openWith = useCallback((d: T) => {
    setData(d);
    setOpen(true);
  }, []);
  const openEmpty = useCallback(() => {
    setData(null);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setData(null);
  }, []);

  return { open, data, openWith, openEmpty, close };
}
