import { Link } from 'react-router-dom';
import { count, select } from '../lib/supabase';
import type { DeptSummary, SalesSummary } from '../types/db';
import { deptHealth, rollUp, salesByMonth, monthsOf } from '../lib/metrics';
import { NOUN, arCount, fmtInt, fmtMoney, fmtMoneyCompact, fmtMonth, fmtPct, monthKey, startOfTodayISO } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useRefresh } from '../hooks/useRefresh';
import { useErrorToast } from '../hooks/useErrorToast';
import { StatTile, Ring } from '../components/ui/Stat';
import { Card, EmptyState, ErrorState, SectionTitle, SkeletonCard, Skeleton, cx } from '../components/ui/primitives';
import { DeptCard } from '../components/DeptCard';
import { IconCheck, IconClock, IconInbox, IconTarget, IconUrgent, IconUserOff } from '../components/Icons';

export default function Overview() {
  const { tick } = useRefresh();

  const depts = useAsync(() => select<DeptSummary>('dept_summary', { order: 'open_cnt.desc' }), [tick]);

  const today = useAsync(async () => {
    const since = startOfTodayISO();
    const [opened, closed] = await Promise.all([
      count('fact_ticket', { create_date: `gte.${since}` }),
      count('fact_ticket', { close_date: `gte.${since}` }),
    ]);
    return { opened, closed };
  }, [tick]);

  const sales = useAsync(
    () => select<SalesSummary>('sales_summary', { order: 'achieved_total.desc', limit: 5000 }),
    [tick],
  );

  useErrorToast(depts.error, today.error, sales.error);

  const totals = depts.data ? rollUp(depts.data) : null;
  const needsAttention = (depts.data ?? []).filter((d) => deptHealth(d) === 'bad');

  // Prefer the current month; fall back to the latest month that has data so
  // the card is never blank on the 1st.
  const months = sales.data ? monthsOf(sales.data) : [];
  const current = monthKey();
  const shownMonth = months.includes(current) ? current : months[0];
  const monthRows = (sales.data ?? []).filter((r) => r.month === shownMonth);
  const monthTotal = monthRows.reduce((s, r) => s + (r.achieved_total ?? 0), 0);
  const top3 = [...monthRows]
    .sort((a, b) => (b.achieved_total ?? 0) - (a.achieved_total ?? 0))
    .slice(0, 3);
  const trend = sales.data ? salesByMonth(sales.data).slice(-6) : [];

  return (
    <div className="space-y-6">
      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle title="مؤشرات النهاردة" subtitle="مجمّعة على مستوى الشركة" />

        {depts.loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} lines={0} />
            ))}
          </div>
        ) : depts.error ? (
          <Card>
            <ErrorState error={depts.error} onRetry={depts.reload} />
          </Card>
        ) : (
          <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-6', depts.refreshing && 'is-refetching')}>
            <StatTile
              label="تذاكر مفتوحة"
              value={fmtInt(totals?.open)}
              icon={<IconInbox className="h-4 w-4" />}
              tone="brand"
            />
            <StatTile
              label="اتقفل النهاردة"
              value={today.loading ? <Skeleton className="h-7 w-14" /> : fmtInt(today.data?.closed)}
              hint={today.data ? `اتفتح ${fmtInt(today.data.opened)} النهاردة` : undefined}
              icon={<IconCheck className="h-4 w-4" />}
              tone="ok"
            />
            <StatTile
              label="غير مُسندة"
              value={fmtInt(totals?.unassigned)}
              icon={<IconUserOff className="h-4 w-4" />}
              tone={totals && totals.unassigned > 0 ? 'warn' : 'neutral'}
            />
            <StatTile
              label="عاجلة"
              value={fmtInt(totals?.urgent)}
              icon={<IconUrgent className="h-4 w-4" />}
              tone={totals && totals.urgent > 0 ? 'warn' : 'neutral'}
            />
            <StatTile
              label="SLA متأخر"
              value={fmtInt(totals?.failed)}
              icon={<IconClock className="h-4 w-4" />}
              tone={totals && totals.failed > 0 ? 'bad' : 'neutral'}
            />
            <StatTile
              label="التزام SLA"
              value={fmtPct(totals?.slaMetPct)}
              hint="مرجّح بعدد التذاكر"
              icon={<IconTarget className="h-4 w-4" />}
              tone={
                totals?.slaMetPct == null
                  ? 'neutral'
                  : totals.slaMetPct < 80
                    ? 'bad'
                    : totals.slaMetPct < 95
                      ? 'warn'
                      : 'ok'
              }
            />
          </div>
        )}
      </section>

      {/* ── Needs attention ───────────────────────────────────────── */}
      {needsAttention.length > 0 && (
        <section className="rounded-2xl border border-status-bad/25 bg-status-badBg/60 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-status-bad">
            <IconUrgent className="h-4 w-4" />
            أقسام محتاجة تدخّل
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {needsAttention.map((d) => (
              <Link
                key={d.team_name}
                to={`/dept/${encodeURIComponent(d.team_name)}`}
                className="tap rounded-xl bg-white px-3 py-2 text-xs font-semibold text-navy shadow-card transition hover:text-status-bad"
              >
                {d.team_name}
                <span className="ms-2 text-ink-muted">SLA {fmtPct(d.sla_met_pct, 0)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Sales headline (the view's one hero figure) ────────────── */}
      <section>
        <SectionTitle
          title="المبيعات"
          subtitle={shownMonth ? fmtMonth(shownMonth) : 'الشهر الحالي'}
          action={
            <Link to="/sales" className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700">
              كل التفاصيل
            </Link>
          }
        />

        {sales.loading ? (
          <SkeletonCard lines={3} />
        ) : sales.error ? (
          <Card>
            <ErrorState error={sales.error} onRetry={sales.reload} />
          </Card>
        ) : monthRows.length === 0 ? (
          <Card>
            <EmptyState title="مفيش مبيعات متسجّلة" hint="لسه مفيش صفوف في sales_summary للشهر ده." />
          </Card>
        ) : (
          <div className={cx('grid gap-3 lg:grid-cols-3', sales.refreshing && 'is-refetching')}>
            <Card className="min-w-0 lg:col-span-1">
              <p className="text-xs font-medium text-ink-muted">إجمالي المحقّق</p>
              <p className="mt-1 text-4xl font-extrabold leading-tight text-navy sm:text-5xl">
                {fmtMoneyCompact(monthTotal)}
              </p>
              <p className="mt-1.5 text-xs text-ink-muted">{fmtMoney(monthTotal)}</p>
              <p className="mt-3 border-t border-surface-line pt-3 text-xs text-ink-muted">
                {arCount(monthRows.reduce((s, r) => s + (r.deals_count ?? 0), 0), NOUN.deal)} ·{' '}
                {arCount(monthRows.length, NOUN.person)}
              </p>
            </Card>

            <Card className="min-w-0 lg:col-span-2">
              <p className="mb-3 text-xs font-medium text-ink-muted">أعلى 3 هذا الشهر</p>
              <ol className="space-y-2.5">
                {top3.map((p, i) => (
                  <li key={`${p.user_name}-${i}`} className="flex items-center gap-3">
                    <span
                      className={cx(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold',
                        i === 0 ? 'bg-accent-100 text-accent-600' : 'bg-brand-50 text-brand-600',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">
                      {p.user_name ?? '—'}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-navy">
                      {fmtMoneyCompact(p.achieved_total)}
                    </span>
                  </li>
                ))}
              </ol>
              {trend.length > 1 && (
                <p className="mt-3 border-t border-surface-line pt-3 text-[11px] text-ink-muted">
                  آخر {trend.length} شهور:{' '}
                  {trend.map((t) => fmtMonth(t.month, true)).join(' · ')}
                </p>
              )}
            </Card>
          </div>
        )}
      </section>

      {/* ── Department grid ───────────────────────────────────────── */}
      <section>
        <SectionTitle
          title="الأقسام"
          subtitle={depts.data ? arCount(depts.data.length, NOUN.dept) : undefined}
          action={
            totals?.slaMetPct != null ? (
              <div className="shrink-0">
                <Ring value={totals.slaMetPct} size={52} stroke={6} />
              </div>
            ) : undefined
          }
        />

        {depts.loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : depts.error ? null : depts.data?.length === 0 ? (
          <Card>
            <EmptyState title="مفيش أقسام" hint="الـ view اسمه dept_summary — اتأكد إنه فيه بيانات." />
          </Card>
        ) : (
          <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', depts.refreshing && 'is-refetching')}>
            {depts.data?.map((d) => (
              <DeptCard key={d.team_name} dept={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
