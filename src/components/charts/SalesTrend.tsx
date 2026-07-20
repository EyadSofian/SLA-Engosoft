import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthTotals } from '../../lib/metrics';
import { CHART, SERIES, TOOLTIP_STYLE } from '../../lib/theme';
import { fmtMoney, fmtMoneyCompact, fmtMonth } from '../../lib/format';
import { ChartFrame, MiniTable } from './ChartFrame';
import { EmptyState } from '../ui/primitives';

/** Compact y-axis ticks: 1.2م / 850ألف — full values live in the tooltip and table. */
function axisTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}م`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}ألف`;
  return String(v);
}

/**
 * Single series → one colour (slot 1) and no legend box: the title already
 * names what is plotted.
 */
export function SalesTrend({ data }: { data: MonthTotals[] }) {
  const rows = data.map((d) => ({ ...d, label: fmtMonth(d.month, true) }));

  const table = (
    <MiniTable
      head={['الشهر', 'المحقّق', 'عدد الصفقات']}
      rows={[...rows].reverse().map((r) => [fmtMonth(r.month), fmtMoney(r.achieved), r.deals])}
    />
  );

  return (
    <ChartFrame title="تطوّر المبيعات شهريًا" subtitle="إجمالي المحقّق لكل شهر" table={table}>
      {rows.length === 0 ? (
        <EmptyState title="مفيش بيانات مبيعات" hint="لسه مفيش صفوف في sales_summary." />
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
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
                width={52}
                tickFormatter={axisTick}
                tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'Cairo' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }}
                formatter={(v: number) => [fmtMoneyCompact(v), 'المحقّق']}
              />
              <Line
                type="monotone"
                dataKey="achieved"
                stroke={SERIES}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                // ≥8px markers, each carrying a 2px surface ring so they stay
                // legible where they cross the line.
                dot={{ r: 4, fill: SERIES, stroke: CHART.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: SERIES, stroke: CHART.surface, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
