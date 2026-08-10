/**
 * 设计令牌的 TS 常量（仅图表等无法用 Tailwind 类的场景使用）。
 * 组件里禁止出现裸 hex——需要颜色先来这里取。
 */
export const CHART = {
  ink: '#1b1b1b',
  neon: '#CCFF00',
  neonDark: '#B8E600',
  pink: '#FF2EC4',
  grid: '#e8e8e8',
  axis: '#777777',
} as const;

export type ChartColorKey = keyof typeof CHART;
