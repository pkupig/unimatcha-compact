/**
 * 全站枚举的中文标签 + 徽标变体（唯一定义处，EnumMeta 模式）。
 * StatusBadge 直接消费 EnumMeta，标签与颜色永不脱节；
 * 页面里再写一份 XXX_LABELS 属于返工，代码评审直接打回。
 */
export type BadgeVariant = 'neutral' | 'neon' | 'ink' | 'pink' | 'outline';

export interface EnumMeta<T extends string = string> {
  labels: Record<T, string>;
  variants: Record<T, BadgeVariant>;
}

function defineEnum<T extends string>(
  defs: Record<T, [label: string, variant: BadgeVariant]>,
): EnumMeta<T> {
  const labels = {} as Record<T, string>;
  const variants = {} as Record<T, BadgeVariant>;
  for (const key of Object.keys(defs) as T[]) {
    labels[key] = defs[key][0];
    variants[key] = defs[key][1];
  }
  return { labels, variants };
}

/** 未知值兜底取标签（渲染原始串），禁止在页面里手写 map[value] || value */
export function labelOf<T extends string>(
  meta: EnumMeta<T>,
  value: T | string | null | undefined,
  fallback = '-',
): string {
  if (!value) return fallback;
  return meta.labels[value as T] ?? String(value);
}

// ── 账号与角色 ────────────────────────────────────────────
export const ADMIN_ROLE = defineEnum({
  SUPER: ['超级管理员', 'ink'],
  TEAM: ['平台团队', 'ink'],
  STUDENT_UNION: ['学生会', 'neon'],
  SPONSOR: ['广告商', 'outline'],
});

export const USER_STATUS = defineEnum({
  ACTIVE: ['正常', 'neon'],
  BANNED: ['已封禁', 'pink'],
});

export const VERIFICATION_STATUS = defineEnum({
  unverified: ['未认证', 'neutral'],
  pending: ['待审核', 'outline'],
  verified: ['已认证', 'neon'],
  rejected: ['已驳回', 'pink'],
});

/** Profile.gender（对齐 H5 注册枚举）；null=未填写在调用点兜底 */
export const GENDER = defineEnum({
  male: ['男', 'ink'],
  female: ['女', 'pink'],
  non_binary: ['非二元', 'neutral'],
  other: ['其他', 'neutral'],
});

export const MATCH_MODE = defineEnum({
  romantic: ['恋爱', 'pink'],
  friend: ['朋友', 'neon'],
});

export const MATCH_STATE = defineEnum({
  idle: ['空闲', 'neutral'],
  searching: ['匹配中', 'outline'],
  matched: ['已匹配', 'neon'],
  confirming: ['确认中', 'outline'],
  relationship: ['关系中', 'ink'],
  // 空轮标记按后端实际写入值命名（users 域核对：schema 用 no_match）
  no_match: ['未匹配', 'neutral'],
});

// ── 广告 ─────────────────────────────────────────────────
export const CAMPAIGN_STATUS = defineEnum({
  DRAFT: ['草稿', 'neutral'],
  PENDING_UNION_REVIEW: ['学生会审核中', 'outline'],
  PENDING_PLATFORM_REVIEW: ['平台审核中', 'outline'],
  REJECTED: ['已驳回', 'pink'],
  PENDING_PAYMENT: ['待付款', 'outline'],
  SCHEDULED: ['已排期', 'neutral'],
  ACTIVE: ['投放中', 'neon'],
  PAUSED: ['已暂停', 'neutral'],
  SUSPENDED: ['已强制下架', 'pink'],
  COMPLETED: ['已完成', 'ink'],
});

export const PRICING_MODEL = defineEnum({
  BUYOUT: ['包断', 'ink'],
  CPM: ['CPM', 'outline'],
  CPC: ['CPC', 'outline'],
});

// ── 财务 ─────────────────────────────────────────────────
export const WITHDRAWAL_STATUS = defineEnum({
  PENDING: ['待审核', 'outline'],
  APPROVED: ['已批准', 'neon'],
  REJECTED: ['已驳回', 'pink'],
  PAID: ['已打款', 'ink'],
});

export const LEDGER_TYPE = defineEnum({
  AD_SHARE: ['广告分成', 'neon'],
  SPONSOR_GRANT: ['赞助发放', 'ink'],
  WITHDRAWAL: ['提现扣减', 'pink'],
  ADJUSTMENT: ['手工调整', 'outline'],
  CONVERSION_OUT: ['兑换扣减', 'pink'],
  EVENT_TICKET: ['门票收入', 'neon'],
});

// ── 能量经济（2026-08）─────────────────────────────────────
export const SPONSOR_LEDGER_TYPE = defineEnum({
  TOPUP: ['充值', 'neon'],
  CAMPAIGN_LOCK: ['投放预扣', 'pink'],
  REFUND: ['退回', 'neon'],
  ADJUSTMENT: ['手工调整', 'outline'],
});

export const CASH_LEDGER_TYPE = defineEnum({
  CONVERSION_IN: ['兑换入账', 'neon'],
  WITHDRAWAL: ['提现扣减', 'pink'],
  ADJUSTMENT: ['手工调整', 'outline'],
});

export const CONVERSION_STATUS = defineEnum({
  PENDING: ['待审批', 'outline'],
  APPROVED: ['已通过', 'neon'],
  REJECTED: ['已驳回', 'pink'],
});

/** 邀请码派生态（前端由 isActive/expiresAt/maxUses/usedCount 派生 key，禁止页面手写 map） */
export const INVITE_STATUS = defineEnum({
  active: ['生效中', 'neon'],
  disabled: ['已停用', 'neutral'],
  expired: ['已过期', 'pink'],
  exhausted: ['已用完', 'ink'],
});

/** 合作消息线程的参与侧（气泡署名与发起方徽标共用） */
export const THREAD_SIDE = defineEnum({
  SPONSOR: ['广告商', 'outline'],
  UNION: ['学生会', 'neon'],
});

// ── 广场 ─────────────────────────────────────────────────
export const SQUARE_BOARD = defineEnum({
  RECOMMEND: ['推荐流', 'neutral'],
  CAMPUS_WALL: ['校园墙', 'outline'],
});

/** 同一枚举全站唯一中文（终结旧版两页文案不一致） */
export const AUTHOR_TYPE = defineEnum({
  USER: ['用户', 'neutral'],
  STUDENT_UNION: ['学生会', 'neon'],
  TEAM: ['平台团队', 'ink'],
  SPONSOR: ['广告商', 'outline'],
});

export const POLL_STATUS = defineEnum({
  pending: ['待审核', 'outline'],
  approved: ['已通过', 'neon'],
  rejected: ['已驳回', 'pink'],
});

export const REPORT_STATUS = defineEnum({
  open: ['待处理', 'outline'],
  resolved: ['已处理', 'neon'],
});

export const REPORT_CATEGORY = defineEnum({
  bug: ['功能问题', 'outline'],
  user: ['用户举报', 'pink'],
  content: ['内容举报', 'pink'],
  other: ['其他', 'neutral'],
});

// ── 官网提交 ─────────────────────────────────────────────
export const SUBMISSION_TYPE = defineEnum({
  SPONSOR: ['赞助申请', 'ink'],
  WAITLIST: ['候补名单', 'outline'],
});

export const SUBMISSION_STATUS = defineEnum({
  PENDING: ['待处理', 'outline'],
  CONTACTED: ['已联系', 'neutral'],
  APPROVED: ['已开通', 'neon'],
  REJECTED: ['已关闭', 'pink'],
});

// ── 活动与门票 ────────────────────────────────────────────
export const EVENT_STATUS = defineEnum({
  published: ['售票中', 'neon'],
  closed: ['已停售', 'neutral'],
  cancelled: ['已取消', 'pink'],
});

export const TICKET_STATUS = defineEnum({
  valid: ['有效', 'neon'],
  used: ['已核销', 'ink'],
  cancelled: ['已取消', 'pink'],
});

// ── 问卷 ─────────────────────────────────────────────────
export const QUESTIONNAIRE_TYPE = defineEnum({
  ROMANTIC: ['恋爱问卷', 'pink'],
  FRIEND: ['朋友问卷', 'neon'],
});

export const QUESTION_TYPE = defineEnum({
  SINGLE_CHOICE: ['单选', 'neutral'],
  MULTIPLE_CHOICE: ['多选', 'neutral'],
  SCALE: ['量表', 'outline'],
  TEXT: ['文本', 'outline'],
});

// ── 匹配任务 ─────────────────────────────────────────────
export const MATCH_JOB_STATUS = defineEnum({
  PENDING: ['排队中', 'neutral'],
  RUNNING: ['运行中', 'outline'],
  COMPLETED: ['已完成', 'neon'],
  FAILED: ['失败', 'pink'],
});
