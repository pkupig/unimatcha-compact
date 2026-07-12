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

/** 千分位整数：formatNumber(1234567) === '1,234,567' */
export function formatNumber(n?: number | null): string {
  return (n ?? 0).toLocaleString('zh-CN');
}

/** 基点 → 百分比：bpsToPercent(3000) === '30%'，bpsToPercent(1250) === '12.5%' */
export function bpsToPercent(bps?: number | null): string {
  const pct = (bps ?? 0) / 100;
  // 去掉多余小数位（3000 → '30' 而非 '30.00'）
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
