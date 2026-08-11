'use client';

/** 启用/停用状态筛选条（账号三 tab 与邀请码面板共用，防复制分叉） */
import { FilterBar } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/form';

export function ActiveFilterBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FilterBar>
      <Select className="w-36" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">全部状态</option>
        <option value="true">启用</option>
        <option value="false">停用</option>
      </Select>
    </FilterBar>
  );
}
