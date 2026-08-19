import { MatchMode, QuestionnaireType } from '@prisma/client';

/**
 * 双模式公共工具（§1.3）：mode 字符串 <-> Prisma 枚举映射 + 状态集判定。
 * 应用层一律用小写字符串 'romantic' | 'friend'；DB 层用枚举。
 */
export type ModeStr = 'romantic' | 'friend';

export const toMatchMode = (m: ModeStr): MatchMode =>
  m === 'friend' ? MatchMode.FRIEND : MatchMode.ROMANTIC;

export const toQType = (m: ModeStr): QuestionnaireType =>
  m === 'friend' ? QuestionnaireType.FRIEND : QuestionnaireType.ROMANTIC;

export const fromMatchMode = (m: MatchMode): ModeStr =>
  m === MatchMode.FRIEND ? 'friend' : 'romantic';

/** 默认 romantic，向下兼容旧的无 mode 调用 */
export const normalizeMode = (raw?: string): ModeStr =>
  raw === 'friend' ? 'friend' : 'romantic';

// ── 状态集（§1.3） ─────────────────────────────
// 「临时对话」状态：可聊、带 48h 倒计时、可触发确认
export const TEMP_STATUSES = [
  'MATCHED_ROMANTIC',
  'ROMANTIC_CONFIRMING',
  'MATCHED_FRIEND',
  'FRIEND_CONFIRMING',
];

// 「永久对话」状态：已确认、无 TTL（RELATIONSHIP_MODE 为旧数据兼容）
export const CONFIRMED_STATUSES = [
  'RELATIONSHIP_ROMANTIC',
  'FRIEND_CONFIRMED',
  'RELATIONSHIP_MODE',
];

// 全部可聊状态（临时 + 永久）
export const ALL_CHATTABLE = [...TEMP_STATUSES, ...CONFIRMED_STATUSES];

/** 某状态是否为临时对话（前端用于展示倒计时 / 确认入口） */
export const isTempStatus = (s: string) => TEMP_STATUSES.includes(s);

/** 某状态是否为已确认永久对话 */
export const isConfirmedStatus = (s: string) => CONFIRMED_STATUSES.includes(s);

// 48h 过期窗口（毫秒）：以 Match.createdAt 起算
export const CONFIRM_WINDOW_MS = 48 * 60 * 60 * 1000;

// 每模式「临时对话」的初始状态（匹配产出时写入）
export const matchedStatusOf = (m: ModeStr): string =>
  m === 'friend' ? 'MATCHED_FRIEND' : 'MATCHED_ROMANTIC';

// 单方已确认状态
export const confirmingStatusOf = (m: ModeStr): string =>
  m === 'friend' ? 'FRIEND_CONFIRMING' : 'ROMANTIC_CONFIRMING';

// 双方确认后的永久状态
export const confirmedStatusOf = (m: ModeStr): string =>
  m === 'friend' ? 'FRIEND_CONFIRMED' : 'RELATIONSHIP_ROMANTIC';

// 朋友候选上限（每轮）；恋人为 1
export const MAX_FRIEND_CANDIDATES = 5;
export const MAX_ROMANTIC_CANDIDATES = 1;
