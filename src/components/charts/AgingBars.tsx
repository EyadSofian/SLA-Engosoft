import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DeptSummary } from '../../types/db';
import { CHART, ORDINAL_3, TOOLTIP_STYLE } from '../../lib/theme';
import { NOUN, arCount, fmtInt } from '../../lib/format';
import { ChartFrame, MiniTable } from './ChartFrame';
import { EmptyState } from '../ui/primitives';

const BANDS = [
  { key: 'backlog_1_3', label: 'من 1 لـ 3 أيام' },
  { key: 'backlog_3_7', label: 'من 3 لـ 7 أيام' },
  { key: 'backlog_7p', label: 'أكتر من 7 أيام' },
] as const;

/**
 * Aging buckets are *ordered* categories, so they get the ordinal ramp
 * (one hue, light → dark) rather than a green/amber/red status ramp — status
 * colours here would double-encode magnitude that the bar length already shows.
 */
export function AgingBars({ dept }: { dept: DeptSummary }) {
  const data = BANDS.map((b, i) => ({
    label: b.label,
    value: Number(dept[b.key] ?? 0),
    fill: ORDINAL_3[i],
  }));

  const total = data.reduce((s, d) => s + d.value, 0);

  const table = (
    <MiniTable
      head={['الفترة', 'عدد التذاكر']}
      rows={data.map((d) => [d.label, fmtInt(d.value)])}
    />
  );

  return (
    <ChartFrame
      title="أعمار التذاكر المفتوحة"
      subtitle={total > 0 ? `${arCount(total, NOUN.ticket)} مستنية` : undefined}
      table={table}
    >
      {total === 0 ? (
        <EmptyState title="مفيش تذاكر متأخرة" hint="كل التذاكر المفتوحة لسه في وقتها." />
      ) : (
        // Height covers the plot *and* the x-axis band, so the card never
        // grows an inner scrollbar.
        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid stroke={CHART.grid} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="label"
                reversed
                tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'Cairo' }}
                tickLine={false}
                axisLine={{ stroke: CHART.grid }}
              />
              <YAxis
                orientation="right"
                allowDecimals={false}
                width={38}
                tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'Cairo' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v: number) => [fmtInt(v), 'تذاكر']}
              />
              <Bar dataKey="value" maxBarSize={CHART.maxBarSize} radius={CHART.barRadius}>
                {data.map((d) => (
                  <Cell key={d.label} fill={d.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  offset={8}
                  formatter={(v: number) => fmtInt(v)}
                  style={{ fill: '#0B2545', fontSize: 12, fontWeight: 700, fontFamily: 'Cairo' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
