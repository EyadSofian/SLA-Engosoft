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
import { IconPhone } from '../components/Icons';

type Tab = 'month' | 'all';

export default function Sales() {
  const { tick } = useRefresh();
  const [tab, setTab] = useState<Tab>('month');
  const [untaxed, setUntaxed] = useState(false);
  const [month, setMonth] = useState<string | null>(null);

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
                  onChange={(e) => setMonth(e.target.value)}
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

      {sales.error ? (
        <Card>
          <ErrorState error={sales.error} onRetry={sales.reload} />
        </Card>
      ) : tab === 'month' ? (
        <>
          {/* ── CRM ownership + conversion ───────────────────────── */}
          {crm.loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} lines={0} />)}
            </div>
          ) : crm.error ? (
            <Card><ErrorState error={crm.error} onRetry={crm.reload} /></Card>
          ) : (
            <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-4', crm.refreshing && 'is-refetching')}>
              <StatTile label="ليدز مفتوحة حاليًا" value={fmtInt(crmTotals.open)} tone="brand" />
              <StatTile label="ليدز جديدة" value={fmtInt(crmTotals.newLeads)} />
              <StatTile label="لم يتم الاتصال" value={fmtInt(crmTotals.uncontacted)} tone={crmTotals.uncontacted ? 'bad' : 'ok'} />
              <StatTile label="متوسط أول مكالمة" value={crmTotals.firstCallMinutes == null ? '—' : fmtHours(crmTotals.firstCallMinutes / 60)} />
              <StatTile label="Closed Won" value={fmtInt(crmTotals.won)} tone="ok" />
              <StatTile label="Closed Lost" value={fmtInt(crmTotals.lost)} tone={crmTotals.lost ? 'warn' : 'neutral'} />
              <StatTile label="نسبة التحويل" value={fmtPct(crmTotals.conversion)} tone={crmTotals.conversion == null ? 'neutral' : crmTotals.conversion >= 30 ? 'ok' : 'warn'} />
              <StatTile label="مكالمات صادرة" value={fmtInt(crmTotals.calls)} icon={<IconPhone className="h-4 w-4" />} />
            </div>
          )}

          <Card as="section">
            <SectionTitle title="أداء موظفي السيلز" subtitle={selected ? `${fmtMonth(selected)} · CRM + Yeastar` : undefined} />
            {crm.loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : crmRows.length === 0 ? (
              <EmptyState title="لسه مفيش CRM metrics للشهر ده" hint="شغّل Workflow مزامنة CRM بعد تطبيق operational-schema-v2.sql." />
            ) : (
              <div className="overflow-x-auto">
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
            )}
          </Card>

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


          {/* ── Calls ──────────────────────────────────────────────── */}
          <Card as="section">
            <SectionTitle
              title="المكالمات"
              subtitle={selected ? `${fmtMonth(selected)} · من Yeastar` : undefined}
            />
            {crm.loading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : crmRows.length === 0 ? (
              <EmptyState
                title="لسه مفيش بيانات مكالمات"
                hint="المكالمة لا تظهر هنا إلا بعد ربط Extension بموظف Odoo في map_extension."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="عدد المكالمات" value={fmtInt(crmTotals.calls)} icon={<IconPhone className="h-4 w-4" />} />
                <StatTile label="اتردّ عليها" value={fmtInt(crmTotals.answered)} tone="ok" />
                <StatTile label="نسبة الرد" value={fmtPct(crmTotals.answer, 0)} tone={crmTotals.answer != null && crmTotals.answer >= 80 ? 'ok' : 'warn'} />
                <StatTile label="إجمالي وقت الكلام" value={fmtDuration(crmTotals.talk)} />
              </div>
            )}
          </Card>
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
