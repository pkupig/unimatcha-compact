import { Badge } from '@/components/ui/Badge';
import { MATCH_MODE, MATCH_STATE, labelOf, type BadgeVariant } from '@/lib/labels';
import type { UserModeStateBrief } from '@/lib/types';

/** 徽标颜色跟 matchState 走（模式名只是前缀文案）；未知状态中性兜底 */
function stateVariant(state: string): BadgeVariant {
  return MATCH_STATE.variants[state as keyof typeof MATCH_STATE.variants] ?? 'neutral';
}

/** USR-3 双模式徽标（恋爱/朋友 × matchState），列表单元格与详情模式卡共用 */
export function ModeStateBadges({ modeStates }: { modeStates: UserModeStateBrief[] }) {
  if (modeStates.length === 0) return <span className="text-outline">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {modeStates.map((m) => (
        <Badge key={m.mode} variant={stateVariant(m.matchState)}>
          {labelOf(MATCH_MODE, m.mode)} · {labelOf(MATCH_STATE, m.matchState)}
        </Badge>
      ))}
    </div>
  );
}
