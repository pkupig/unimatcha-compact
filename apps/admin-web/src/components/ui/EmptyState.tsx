import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  icon: Icon = Inbox,
  text,
  action,
}: {
  icon?: LucideIcon;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="w-11 h-11 rounded-lg bg-surface-low flex items-center justify-center">
        <Icon size={20} className="text-outline" />
      </div>
      <p className="text-sm text-on-surface-variant">{text}</p>
      {action}
    </div>
  );
}
