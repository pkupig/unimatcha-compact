'use client';

/** 图片 URL 列表输入（ADSN-1）：增删行，至少保留 1 行 */
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/form';

export function ImageUrlListInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {value.map((url, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(e) => onChange(value.map((u, j) => (j === i ? e.target.value : u)))}
            placeholder="https://…"
          />
          {value.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-low hover:text-neon-pink transition-colors shrink-0"
              aria-label="删除图片"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <Button size="sm" type="button" onClick={() => onChange([...value, ''])}>
        <Plus size={14} />
        添加图片
      </Button>
    </div>
  );
}
