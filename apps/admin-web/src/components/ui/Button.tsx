'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** cta 每屏最多一个（荧光绿主行动） */
  variant?: 'cta' | 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        variant === 'cta' && 'btn-cta',
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'danger' && 'btn-danger',
        variant === 'ghost' &&
          'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-low hover:text-ink transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' && 'btn-sm',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
});
