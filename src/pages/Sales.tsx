import { useMemo, useState } from 'react';
import { select } from '../lib/supabase';
import type { SalesPersonTotals, SalesRepMonthly, SalesSummary } from '../types/db';
import { monthsOf, salesByMonth } from '../lib/metrics';
import {
  NOUN,
  arCount,
  fmtDuration,
  fmtHours,
  fmtInt,
  fmtMoney,
  fmtMoneyCompact,
  fmtMonth,
  fmtPct,
  monthKey,
} from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useRefresh } from '../hooks/useRefresh';
import { useErrorToast } from '../hooks/useErrorToast';
import { Meter, StatTile } from '../components/ui/Stat';
import {
  Card,
  EmptyState,
  ErrorState,
  SectionTitle,
  Skeleton,
  SkeletonCard,
  cx,
} from '../components/ui/primitives';
import { PersonCard } from '../components/PersonCard';
import { SalesTrend } from '../components/charts/SalesTrend';
import { IconLost, IconPhone } from '../components/Icons';

type Tab = 'month' | 'all';

export default function Sales() {
  const { tick } = useRefresh();
  const [tab, setTab] = useState<Tab>('month');
  const [untaxed, setUntaxed] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [showAllCrm, setShowAllCrm] = useState(false);

  const sales = useAsync(
    () => select<SalesSummary>('sales_summary', { order: 'month.desc', limit: 5000 }),
    [tick],
  );

  const allTime = useAsync(
    () => select<SalesPersonTotals>('sales_person_totals', { order: 'achieved_total_all.desc', limit: 1000 }),
    [tick],
  );

  const crm = useAsync(
    () => select<SalesRepMonthly>('sales_rep_monthly', { order: 'month.desc,user_name.asc', limit: 10000 }),
    [tick],
  );

  const months = useMemo(() => {
    const financialMonths = sales.data ? monthsOf(sales.data) : [];
    const crmMonths = (crm.data ?? []).map((row) => row.month);
    return [...new Set([...financialMonths, ...crmMonths])].sort((a, b) => b.localeCompare(a));
  }, [sales.data, crm.data]);
  const selected = month ?? (months.includes(monthKey()) ? monthKey() : months[0]) ?? null;

  useErrorToast(sales.error, allTime.error, crm.error);

  const rows = useMemo(
    () =>
      (sales.data ?? [])
        .filter((r) => r.month === selected)
        .sort((a, b) => (b.achieved_total ?? 0) - (a.achieved_total ?? 0)),
    [sales.data, selected],
  );

  const value = (r: SalesSummary) => (untaxed ? r.achieved_untaxed : r.achieved_total) ?? 0;
  const monthTotal = rows.reduce((s, r) => s + value(r), 0);
  const dealsTotal = rows.reduce((s, r) => s + (r.deals_count ?? 0), 0);
  const pipelineTotal = rows.reduce((s, r) => s + (r.pipeline_value ?? 0), 0);
  const quotesTotal = rows.reduce((s, r) => s + (r.quotations_count ?? 0), 0);
  const trend = useMemo(() => (sales.data ? salesByMonth(sales.data) : []), [sales.data]);

  const crmRows = useMemo(
    () => (crm.data ?? [])
      .filter((row) => row.month === selected)
      .sort((a, b) => b.won_leads - a.won_leads || b.open_leads - a.open_leads),
    [crm.data, selected],
  );

  const crmTotals = useMemo(() => {
    const total = {
      open: 0, newLeads: 0, contacted: 0, uncontacted: 0, won: 0, lost: 0,
      calls: 0, answered: 0, talk: 0, firstCallWeighted: 0, firstCallN: 0,
    };
    for (const row of crmRows) {
      total.open += row.open_leads;
      total.newLeads += row.new_leads;
      total.contacted += row.contacted_leads;
      total.uncontacted += row.uncontacted_leads;
      total.won += row.won_leads;
      total.lost += row.lost_leads;
      total.calls += row.outbound_calls;
      total.answered += row.answered_calls;
      total.talk += row.talk_sec;
      if (row.avg_first_call_minutes != null && row.contacted_leads > 0) {
        total.firstCallWeighted += row.avg_first_call_minutes * row.contacted_leads;
        total.firstCallN += row.contacted_leads;
      }
    }
    return {
      ...total,
      conversion: total.won + total.lost ? (total.won / (total.won + total.lost)) * 100 : null,
      contact: total.newLeads ? (total.contacted / total.newLeads) * 100 : null,
      answer: total.calls ? (total.answered / total.calls) * 100 : null,
      firstCallMinutes: total.firstCallN ? total.firstCallWeighted / total.firstCallN : null,
    };
  }, [crmRows]);

  const lostRows = useMemo(
    () => crmRows.filter((row) => row.lost_leads > 0).sort((a, b) => b.lost_leads - a.lost_leads),
    [crmRows],
  );
  const maxLost = lostRows[0]?.lost_leads ?? 1;

  // One target per team — the view repeats it on every person's row.
  const teams = useMemo(() => {
    const map = new Map<string, { team: string; achieved: number; target: number | null; people: number }>();
    for (const r of rows) {
      const team = r.team_name ?? 'بدون فريق';
      const entry = map.get(team) ?? { team, achieved: 0, target: r.team_target ?? null, people: 0 };
      entry.achieved += value(r);
      entry.people += 1;
      if (entry.target == null && r.team_target != null) entry.target = r.team_target;
      map.set(team, entry);
    }
    return [...map.values()].sort((a, b) => b.achieved - a.achieved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, untaxed]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy">المبيعات</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          {tab === 'all'
            ? 'إجمالي كل الشهور'
            : selected
              ? fmtMonth(selected)
              : sales.loading
                ? 'بيحمّل…'
                : 'مفيش بيانات'}
        </p>
      </div>

      {/* One filter row scoping every card below it. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {(['month', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cx(
                'tap min-h-[44px] shrink-0 rounded-xl px-4 text-xs font-semibold transition',
                tab === t ? 'bg-navy text-white' : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
              )}
            >
              {t === 'month' ? 'الشهر المختار' : 'كل الوقت'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUntaxed((v) => !v)}
            aria-pressed={untaxed}
            className={cx(
              'tap min-h-[44px] rounded-xl px-3 text-xs font-semibold transition',
              untaxed ? 'bg-brand-500 text-white' : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
            )}
          >
            {untaxed ? 'قبل الضريبة' : 'شامل الضريبة'}
          </button>

          {sales.loading ? (
            <Skeleton className="h-11 w-40" />
          ) : (
            months.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="sr-only">اختار الشهر</span>
                <select
                  value={selected ?? ''}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setShowAllCrm(false);
                  }}
                  className="min-h-[44px] rounded-xl border border-surface-line bg-white px-3 text-sm font-semibold text-navy focus:border-brand-300"
                >
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {fmtMonth(m)}
                    </option>
                  ))}
                </select>
              </label>
            )
          )}
        </div>
      </div>

      {tab === 'month' && (
        <nav
          className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
          aria-label="اختصارات المبيعات"
        >
          <a
            href="#closed-lost"
            className="tap inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-status-warn/30 bg-status-warnBg px-3 text-xs font-bold text-[#92400E]"
          >
            <IconLost className="h-4 w-4" />
            Closed Lost
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px]">{crm.loading ? '—' : fmtInt(crmTotals.lost)}</span>
          </a>
          <a
            href="#sales-team"
            className="tap inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-surface-line bg-white px-3 text-xs font-semibold text-navy"
          >
            أداء الموظفين
          </a>
          <a
            href="#sales-operations"
            className="tap inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-surface-line bg-white px-3 text-xs font-semibold text-navy"
          >
            <IconPhone className="h-4 w-4" />
            المكالمات
          </a>
        </nav>
      )}

      {sales.error ? (
        <Card>
          <ErrorState error={sales.error} onRetry={sales.reload} />
        </Card>
      ) : tab === 'month' ? (
        <>
          {/* ── CRM ownership + conversion ───────────────────────── */}
          {crm.loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={0} />)}
            </div>
          ) : crm.error ? (
            <Card><ErrorState error={crm.error} onRetry={crm.reload} /></Card>
          ) : (
            <>
              <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-4', crm.refreshing && 'is-refetching')}>
                <StatTile label="ليدز مفتوحة" value={fmtInt(crmTotals.open)} tone="brand" />
                <StatTile label="Closed Won" value={fmtInt(crmTotals.won)} tone="ok" />
                <StatTile
                  label="Closed Lost"
                  value={fmtInt(crmTotals.lost)}
                  icon={<IconLost className="h-4 w-4" />}
                  tone={crmTotals.lost ? 'warn' : 'neutral'}
                />
                <StatTile
                  label="نسبة التحويل"
                  value={fmtPct(crmTotals.conversion)}
                  tone={crmTotals.conversion == null ? 'neutral' : crmTotals.conversion >= 30 ? 'ok' : 'warn'}
                />
              </div>

              <details id="sales-operations" className="card group scroll-mt-28 overflow-hidden">
                <summary className="tap flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-bold text-navy [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    <IconPhone className="h-4 w-4 text-brand-600" />
                    التشغيل والمكالمات
                  </span>
                  <span className="text-xs font-semibold text-brand-600 group-open:hidden">عرض التفاصيل</span>
                  <span className="hidden text-xs font-semibold text-brand-600 group-open:inline">إخفاء</span>
                </summary>
                <div className="grid grid-cols-2 border-t border-surface-line sm:grid-cols-3 lg:grid-cols-5">
                  <div className="border-b border-surface-line p-3 sm:border-e lg:border-b-0">
                    <p className="text-[11px] text-ink-muted">ليدز جديدة</p>
                    <p className="mt-1 text-lg font-bold text-navy">{fmtInt(crmTotals.newLeads)}</p>
                  </div>
                  <div className="border-b border-surface-line p-3 sm:border-e lg:border-b-0">
                    <p className="text-[11px] text-ink-muted">لم يتم الاتصال</p>
                    <p className={cx('mt-1 text-lg font-bold', crmTotals.uncontacted ? 'text-status-bad' : 'text-status-ok')}>
                      {fmtInt(crmTotals.uncontacted)}
                    </p>
                  </div>
                  <div className="border-b border-surface-line p-3 lg:border-b-0 lg:border-e">
                    <p className="text-[11px] text-ink-muted">متوسط أول مكالمة</p>
                    <p className="mt-1 text-lg font-bold text-navy">
                      {crmTotals.firstCallMinutes == null ? '—' : fmtHours(crmTotals.firstCallMinutes / 60)}
                    </p>
                  </div>
                  <div className="p-3 sm:border-e">
                    <p className="text-[11px] text-ink-muted">المكالمات الصادرة</p>
                    <p className="mt-1 text-lg font-bold text-navy">{fmtInt(crmTotals.calls)}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] text-ink-muted">الرد / وقت الكلام</p>
                    <p className="mt-1 text-sm font-bold text-navy">
                      {fmtPct(crmTotals.answer, 0)} · {fmtDuration(crmTotals.talk)}
                    </p>
                  </div>
                </div>
              </details>

              <section
                id="closed-lost"
                className="card scroll-mt-28 overflow-hidden border-status-warn/30 p-4 sm:p-5"
                aria-labelledby="closed-lost-title"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-status-warnBg text-[#B45309]">
                      <IconLost className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 id="closed-lost-title" className="text-base font-extrabold text-navy">Closed Lost</h2>
                      <p className="mt-0.5 text-xs text-ink-muted">مين محتاج مراجعة أسباب الخسارة هذا الشهر</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-3xl font-extrabold text-[#B45309]">{fmtInt(crmTotals.lost)}</p>
                    <p className="text-[11px] text-ink-muted">ليد مغلق</p>
                  </div>
                </div>

                {lostRows.length === 0 ? (
                  <p className="mt-4 rounded-xl bg-surface-bg p-3 text-sm text-ink-muted">لا توجد Closed Lost في الشهر المختار.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {lostRows.slice(0, 6).map((row) => (
                      <div key={`lost-${row.user_id}`}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <p className="min-w-0 truncate font-semibold text-navy">{row.user_name}</p>
                          <span className="shrink-0 font-bold text-[#B45309]">{fmtInt(row.lost_leads)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-status-warnBg">
                          <div
                            className="h-full rounded-full bg-status-warn transition-[width] duration-500"
                            style={{ width: `${Math.max(6, (row.lost_leads / maxLost) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {lostRows.length > 6 && (
                      <p className="text-[11px] text-ink-muted">باقي الموظفين ظاهرين في أداء الموظفين بالأسفل.</p>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          <section id="sales-team" className="scroll-mt-28">
            <Card>
              <SectionTitle title="أداء موظفي السيلز" subtitle={selected ? `${fmtMonth(selected)} · CRM + Yeastar` : undefined} />
              {crm.loading ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : crmRows.length === 0 ? (
                <EmptyState title="لسه مفيش CRM metrics للشهر ده" hint="شغّل Workflow مزامنة CRM بعد تطبيق operational-schema-v2.sql." />
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {crmRows.slice(0, showAllCrm ? crmRows.length : 12).map((row) => (
                      <article
                        key={`mobile-${row.user_id}`}
                        className={cx(
                          'rounded-2xl border border-surface-line bg-surface-bg/65 p-3.5',
                          row.uncontacted_leads > 0 && 'border-status-warn/30 bg-status-warnBg/35',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-navy">{row.user_name}</p>
                            <p className="mt-0.5 truncate text-[11px] text-ink-faint">{row.team_name ?? 'بدون فريق'}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                            معاه {fmtInt(row.open_leads)}
                          </span>
                        </div>

                        <dl className="mt-3 grid grid-cols-4 gap-2 border-y border-surface-line/80 py-2.5 text-center">
                          <div>
                            <dt className="text-[10px] text-ink-faint">جديدة</dt>
                            <dd className="mt-0.5 text-sm font-bold text-navy">{fmtInt(row.new_leads)}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] text-ink-faint">بدون اتصال</dt>
                            <dd className={cx('mt-0.5 text-sm font-bold', row.uncontacted_leads ? 'text-status-bad' : 'text-status-ok')}>
                              {fmtInt(row.uncontacted_leads)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[10px] text-ink-faint">Won</dt>
                            <dd className="mt-0.5 text-sm font-bold text-status-ok">{fmtInt(row.won_leads)}</dd>
                          </div>
                          <div>
                            <dt className="text-[10px] text-ink-faint">Lost</dt>
                            <dd className="mt-0.5 text-sm font-bold text-[#B45309]">{fmtInt(row.lost_leads)}</dd>
                          </div>
                        </dl>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                          <span>مكالمات {fmtInt(row.outbound_calls)} · رد {fmtPct(row.answer_pct, 0)}</span>
                          <span className="font-bold text-navy">تحويل {fmtPct(row.conversion_pct)}</span>
                        </div>
                      </article>
                    ))}
                    {crmRows.length > 12 && (
                      <button
                        type="button"
                        onClick={() => setShowAllCrm((value) => !value)}
                        className="tap min-h-[48px] w-full rounded-xl border border-brand-200 bg-brand-50 px-4 text-sm font-bold text-brand-700"
                      >
                        {showAllCrm ? 'عرض أهم 12 موظف فقط' : `عرض كل الموظفين (${fmtInt(crmRows.length)})`}
                      </button>
                    )}
                  </div>

                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead>
                        <tr className="border-b border-surface-line text-xs text-ink-muted">
                          <th className="px-2 py-2 text-start font-medium">الموظف</th>
                          <th className="px-2 py-2 text-start font-medium">معاه الآن</th>
                          <th className="px-2 py-2 text-start font-medium">جديدة</th>
                          <th className="px-2 py-2 text-start font-medium">بدون اتصال</th>
                          <th className="px-2 py-2 text-start font-medium">أول مكالمة</th>
                          <th className="px-2 py-2 text-start font-medium">المكالمات</th>
                          <th className="px-2 py-2 text-start font-medium">رد</th>
                          <th className="px-2 py-2 text-start font-medium">Won</th>
                          <th className="px-2 py-2 text-start font-medium">Lost</th>
                          <th className="px-2 py-2 text-start font-medium">التحويل</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crmRows.map((row) => (
                          <tr key={row.user_id} className={cx('border-b border-surface-line/70 last:border-0', row.uncontacted_leads > 0 && 'bg-status-warnBg/35')}>
                            <td className="px-2 py-2"><p className="font-semibold text-navy">{row.user_name}</p><p className="text-[11px] text-ink-faint">{row.team_name ?? 'بدون فريق'}</p></td>
                            <td className="px-2 py-2 font-semibold text-navy">{fmtInt(row.open_leads)}</td>
                            <td className="px-2 py-2 text-ink-muted">{fmtInt(row.new_leads)}</td>
                            <td className={cx('px-2 py-2 font-semibold', row.uncontacted_leads ? 'text-status-bad' : 'text-status-ok')}>{fmtInt(row.uncontacted_leads)}</td>
                            <td className="px-2 py-2 text-ink-muted">{row.avg_first_call_minutes == null ? '—' : fmtHours(row.avg_first_call_minutes / 60)}</td>
                            <td className="px-2 py-2 text-ink-muted">{fmtInt(row.outbound_calls)}</td>
                            <td className="px-2 py-2 text-ink-muted">{fmtPct(row.answer_pct, 0)}</td>
                            <td className="px-2 py-2 font-semibold text-status-ok">{fmtInt(row.won_leads)}</td>
                            <td className="px-2 py-2 font-semibold text-[#B45309]">{fmtInt(row.lost_leads)}</td>
                            <td className="px-2 py-2 font-semibold text-navy">{fmtPct(row.conversion_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </section>

          {/* ── Month KPIs ─────────────────────────────────────────── */}
          {sales.loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} lines={0} />
              ))}
            </div>
          ) : (
            <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-4', sales.refreshing && 'is-refetching')}>
              <StatTile label="المحقّق" value={fmtMoneyCompact(monthTotal)} hint={fmtMoney(monthTotal)} tone="brand" />
              <StatTile label="الصفقات" value={fmtInt(dealsTotal)} />
              <StatTile label="عروض الأسعار" value={fmtInt(quotesTotal)} />
              <StatTile label="Pipeline" value={fmtMoneyCompact(pipelineTotal)} hint={fmtMoney(pipelineTotal)} />
            </div>
          )}

          {/* ── Trend ──────────────────────────────────────────────── */}
          {sales.loading ? <SkeletonCard lines={5} /> : <SalesTrend data={trend} />}

          {/* ── Team totals ────────────────────────────────────────── */}
          {teams.length > 0 && (
            <Card as="section">
              <SectionTitle title="الفرق" subtitle="المحقّق مقابل تارجت الفريق" />
              <div className="space-y-4">
                {teams.map((t) => {
                  const pct = t.target && t.target > 0 ? (t.achieved / t.target) * 100 : null;
                  return (
                    <div key={t.team}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-bold text-navy">{t.team}</p>
                        <p className="text-xs text-ink-muted">
                          {fmtMoney(t.achieved)}
                          {t.target ? ` من ${fmtMoney(t.target)}` : ' · مفيش تارجت'}
                          {pct != null && (
                            <span
                              className={cx(
                                'ms-2 font-bold',
                                pct >= 100 ? 'text-status-ok' : pct >= 70 ? 'text-[#B45309]' : 'text-status-bad',
                              )}
                            >
                              {fmtPct(pct, 0)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="mt-1.5">
                        <Meter
                          value={t.achieved}
                          max={t.target && t.target > 0 ? t.target : t.achieved || 1}
                          tone={pct == null ? 'brand' : pct >= 100 ? 'ok' : pct >= 70 ? 'warn' : 'bad'}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Per-person ─────────────────────────────────────────── */}
          <section>
            <SectionTitle title="الأفراد" subtitle={rows.length ? arCount(rows.length, NOUN.person) : undefined} />
            {sales.loading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} lines={2} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <Card>
                <EmptyState title="مفيش مبيعات في الشهر ده" hint="جرّب تختار شهر تاني من القايمة." />
              </Card>
            ) : (
              <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', sales.refreshing && 'is-refetching')}>
                {rows.map((r, i) => (
                  <PersonCard
                    key={`${r.user_name}-${i}`}
                    person={{
                      rank: i + 1,
                      name: r.user_name ?? '—',
                      team: r.team_name,
                      achieved: value(r),
                      deals: r.deals_count,
                      quotations: r.quotations_count,
                      pipeline: r.pipeline_value,
                      target: r.team_target,
                    }}
                  />
                ))}
              </div>
            )}
          </section>

        </>
      ) : (
        /* ── All-time leaderboard ─────────────────────────────────── */
        <section>
          <SectionTitle
            title="ترتيب كل الوقت"
            subtitle={
              (allTime.data ?? []).length ? arCount((allTime.data ?? []).length, NOUN.person) : undefined
            }
          />
          {allTime.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} lines={2} />
              ))}
            </div>
          ) : allTime.error ? (
            <Card>
              <ErrorState error={allTime.error} onRetry={allTime.reload} />
            </Card>
          ) : (allTime.data ?? []).length === 0 ? (
            <Card>
              <EmptyState title="مفيش بيانات" />
            </Card>
          ) : (
            <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', allTime.refreshing && 'is-refetching')}>
              {(allTime.data ?? []).map((p, i) => (
                <PersonCard
                  key={`${p.user_name}-${i}`}
                  person={{
                    rank: i + 1,
                    name: p.user_name ?? '—',
                    achieved: p.achieved_total_all ?? 0,
                    deals: p.deals_all,
                    quotations: p.quotations_all,
                    pipeline: p.pipeline_all,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
