'use client';

/**
 * recharts 的唯一导入点；颜色一律取 lib/tokens.ts（组件禁裸 hex 的唯一豁免文件）。
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART, type ChartColorKey } from '@/lib/tokens';

export interface TrendSeries {
  key: string;
  name: string;
  color?: ChartColorKey;
}

export function TrendChart({
  data,
  x,
  series,
  kind = 'line',
  height = 260,
  formatY,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: TrendSeries[];
  kind?: 'line' | 'bar';
  height?: number;
  formatY?: (v: number) => string;
}) {
  const axisProps = {
    stroke: CHART.axis,
    fontSize: 11,
    tickLine: false,
    axisLine: { stroke: CHART.grid },
  } as const;
  const palette: ChartColorKey[] = ['ink', 'neon', 'pink'];

  const children = [
    <CartesianGrid key="grid" stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />,
    <XAxis key="x" dataKey={x} {...axisProps} />,
    <YAxis key="y" {...axisProps} tickFormatter={formatY} width={formatY ? 72 : 40} />,
    <Tooltip
      key="tip"
      formatter={(value: number, name: string) => [formatY ? formatY(value) : value, name]}
      contentStyle={{ borderRadius: 10, borderColor: CHART.grid, fontSize: 12 }}
    />,
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === 'bar' ? (
        <BarChart data={data}>
          {children}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={CHART[s.color ?? palette[i % palette.length]]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data}>
          {children}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={CHART[s.color ?? palette[i % palette.length]]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
