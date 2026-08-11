/**
 * 共享格式化工具（Ivory & Ink 设计规范）
 * 金额一律以「分」存储（Int cents），展示时经 fenToYuan 转元；
 * 所有金额/数字请配合 font-mono（JetBrains Mono）使用。
 */

/** 分 → 元：fenToYuan(123456) === '¥1,234.56'；null/undefined 按 0 处理 */
export function fenToYuan(cents?: number | null): string {
  const value = (cents ?? 0) / 100;
  return (
    '¥' +
    value.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * 元 → 分（全站唯一实现）：'12.34' → 1234，四舍五入到分；
 * 空串/非数字/负数 → null（调用方据此拦截或视为未填）
 */
export function yuanToCents(input: string | number): number | null {
  const n = typeof input === 'number' ? input : parseFloat(String(input).trim());
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** 分 → 元输入串（表单回填，无 ¥ 无千分位）：1234 → '12.34'；null/undefined → '' */
export function centsToYuanInput(cents?: number | null): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

/**
 * 能量展示（能量经济：1 元 = 100 分 = 100 能量，数值同构）：
 * formatEnergy(20000) === '20,000 能量'——数值就是 *Cents 字段原值，绝不 /100。
 */
export function formatEnergy(value?: number | null): string {
  return `${(value ?? 0).toLocaleString('zh-CN')} 能量`;
}

/** 千分位整数：formatNumber(1234567) === '1,234,567' */
export function formatNumber(n?: number | null): string {
  return (n ?? 0).toLocaleString('zh-CN');
}

/** 基点 → 百分比：bpsToPercent(3000) === '30%'，bpsToPercent(1250) === '12.5%' */
export function bpsToPercent(bps?: number | null): string {
  const pct = (bps ?? 0) / 100;
  return `${Number(pct.toFixed(2))}%`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 日期：'2026-07-03'；非法输入返回 '-' */
export function formatDate(input?: string | number | Date | null): string {
  if (!input) return '-';
  const d = new Date(input);
  if (isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日期时间：'2026-07-03 14:05'；非法输入返回 '-' */
export function formatDateTime(input?: string | number | Date | null): string {
  if (!input) return '-';
  const d = new Date(input);
  if (isNaN(d.getTime())) return '-';
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 短日期（图表 X 轴）：'07-03' */
export function formatShortDate(input?: string | number | Date | null): string {
  if (!input) return '';
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input).slice(5, 10);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日期 → date input 值：'2026-07-03'（同 formatDate，语义别名供表单用） */
export function toDateInput(input?: string | number | Date | null): string {
  const s = formatDate(input);
  return s === '-' ? '' : s;
}
