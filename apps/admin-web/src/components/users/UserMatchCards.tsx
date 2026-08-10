/**
 * USRD-4 模式状态卡 + 最近匹配卡。
 * 最近匹配合并 matchesAsUserA/B（对方分别是 userB/userA），按时间倒序。
 */
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { MATCH_MODE, labelOf } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import type { AdminUserDetail, MatchCounterpart, UserMatchRecord } from '@/lib/types';
import { ModeStateBadges } from './ModeStateBadges';

export function UserModesCard({ user }: { user: AdminUserDetail }) {
  const hasNoMatchNote = user.modeStates.some((m) => m.weeklyMatchNote === 'no_match');
  return (
    <Card caption="MODE STATES" title="模式状态">
      {user.modeStates.length === 0 ? (
        <p className="text-sm text-outline">暂无模式状态</p>
      ) : (
        <ModeStateBadges modeStates={user.modeStates} />
      )}
      {hasNoMatchNote && <p className="text-xs text-outline mt-2">本轮公布时该用户未匹配到对象</p>}
    </Card>
  );
}

/** Match.mode 是大写枚举，转小写键复用 MATCH_MODE 标签/配色 */
function modeKey(mode: UserMatchRecord['mode']): 'romantic' | 'friend' {
  return mode === 'FRIEND' ? 'friend' : 'romantic';
}

export function UserMatchesCard({ user }: { user: AdminUserDetail }) {
  const matches: (UserMatchRecord & { other: MatchCounterpart })[] = [
    ...user.matchesAsUserA.map((m) => ({ ...m, other: m.userB })),
    ...user.matchesAsUserB.map((m) => ({ ...m, other: m.userA })),
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <Card caption="RECENT MATCHES" title="最近匹配">
      {matches.length === 0 ? (
        <p className="text-sm text-outline">暂无匹配记录</p>
      ) : (
        <ul className="divide-y divide-outline-variant/20 text-sm">
          {matches.map((m) => (
            <li key={m.id} className="py-2.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <Badge variant={MATCH_MODE.variants[modeKey(m.mode)]}>
                  {labelOf(MATCH_MODE, modeKey(m.mode))}
                </Badge>
                <span className="text-on-surface truncate">
                  {m.other.profile?.nickname ?? m.other.email}
                </span>
              </span>
              <span className="font-mono text-xs text-outline shrink-0">{formatDate(m.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
