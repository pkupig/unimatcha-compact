'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

/** 弹窗容器：遮罩点击/Esc 关闭；配合 useModal 键控挂载（{m.open && <Modal/>}）自重置表单 */
export function Modal({
  title,
  caption,
  size = 'md',
  onClose,
  footer,
  children,
}: {
  title: string;
  caption?: string;
  size?: 'sm' | 'md' | 'lg';
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className={clsx(
          'relative bg-white rounded-lg shadow-xl w-full max-h-[88vh] flex flex-col',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            {caption && <p className="caption mb-1">{caption}</p>}
            <h3 className="font-display font-bold text-lg text-on-surface">{title}</h3>
          </div>
          <button
            className="p-1.5 rounded-lg text-outline hover:text-ink hover:bg-surface-low transition-colors"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-2 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
