import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { BadgeVariant } from '@/lib/labels';

export function Badge({
  variant = 'neutral',
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'badge',
        variant === 'neon' && 'badge-neon',
        variant === 'ink' && 'badge-ink',
        variant === 'pink' && 'badge-pink',
        variant === 'outline' && 'badge-outline',
        className,
      )}
    >
      {children}
    </span>
  );
}
