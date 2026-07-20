import { useMemo, useState } from 'react';
import { select } from '../lib/supabase';
import type { FactCall, SalesPersonTotals, SalesSummary } from '../types/db';
import { monthsOf, salesByMonth } from '../lib/metrics';
import {
  NOUN,
  arCount,
  fmtDuration,
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
  TableWrap,
  cx,
} from '../components/ui/primitives';
import { SalesTrend } from '../components/charts/SalesTrend';
import { IconPhone } from '../components/Icons';

type Tab = 'month' | 'all';

/** First day of the month after `month` (`YYYY-MM-01`). */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

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

  const months = useMemo(() => (sales.data ? monthsOf(sales.data) : []), [sales.data]);
  const selected = month ?? (months.includes(monthKey()) ? monthKey() : months[0]) ?? null;

  const calls = useAsync(async () => {
    if (!selected) return [] as FactCall[];
    return select<FactCall>('fact_call', {
      select: 'call_id,extension,user_id,direction,ring_sec,talk_sec,disposition,started_at',
      filter: { and: `(started_at.gte.${selected},started_at.lt.${nextMonth(selected)})` },
      limit: 5000,
    });
  }, [selected, tick]);

  useErrorToast(sales.error, allTime.error);

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

  const callStats = useMemo(() => {
    const list = calls.data ?? [];
    if (!list.length) return null;
    const answered = list.filter((c) => (c.talk_sec ?? 0) > 0).length;
    const talk = list.reduce((s, c) => s + (c.talk_sec ?? 0), 0);
    return { total: list.length, answered, talk, pct: (answered / list.length) * 100 };
  }, [calls.data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy">المبيعات</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          {selected ? fmtMonth(selected) : 'بيحمّل…'}
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
          <Card as="section">
            <SectionTitle title="الأفراد" subtitle={rows.length ? arCount(rows.length, NOUN.person) : undefined} />
            {sales.loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState title="مفيش مبيعات في الشهر ده" hint="جرّب تختار شهر تاني من القايمة." />
            ) : (
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-line text-xs text-ink-muted">
                      <th scope="col" className="px-2 py-2 text-start font-medium">#</th>
                      <th scope="col" className="px-2 py-2 text-start font-medium">الاسم</th>
                      <th scope="col" className="px-2 py-2 text-start font-medium">الفريق</th>
                      <th scope="col" className="px-2 py-2 text-start font-medium">المحقّق</th>
                      <th scope="col" className="px-2 py-2 text-start font-medium">صفقات</th>
                      <th scope="col" className="px-2 py-2 text-start font-medium">عروض</th>
                      <th scope="col" className="px-2 py-2 text-start font-medium">Pipeline</th>
                      <th scope="col" className="min-w-[140px] px-2 py-2 text-start font-medium">من تارجت الفريق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const achieved = value(r);
                      const target = r.team_target;
                      const pct = target && target > 0 ? (achieved / target) * 100 : null;
                      return (
                        <tr key={`${r.user_name}-${i}`} className="border-b border-surface-line/70 last:border-0">
                          <td className="px-2 py-2 text-ink-faint">{i + 1}</td>
                          <td className="max-w-[160px] truncate px-2 py-2 font-semibold text-navy">
                            {r.user_name ?? '—'}
                          </td>
                          <td className="max-w-[120px] truncate px-2 py-2 text-ink-muted">{r.team_name ?? '—'}</td>
                          <td className="whitespace-nowrap px-2 py-2 font-bold text-navy">{fmtMoney(achieved)}</td>
                          <td className="px-2 py-2 text-ink-muted">{fmtInt(r.deals_count)}</td>
                          <td className="px-2 py-2 text-ink-muted">{fmtInt(r.quotations_count)}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{fmtMoney(r.pipeline_value)}</td>
                          <td className="px-2 py-2">
                            {pct == null ? (
                              <span className="text-xs text-ink-faint">مفيش تارجت</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Meter
                                  value={achieved}
                                  max={target!}
                                  tone={pct >= 100 ? 'ok' : pct >= 70 ? 'warn' : 'bad'}
                                />
                                <span className="w-11 shrink-0 text-xs font-bold text-ink-muted">
                                  {fmtPct(pct, 0)}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          {/* ── Calls ──────────────────────────────────────────────── */}
          <Card as="section">
            <SectionTitle
              title="المكالمات"
              subtitle={selected ? `${fmtMonth(selected)} · من Yeastar` : undefined}
            />
            {calls.loading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : calls.error || !callStats ? (
              <EmptyState
                title="لسه مفيش بيانات مكالمات"
                hint="جدول fact_call فاضي للشهر ده — هيشتغل أوتوماتيك أول ما Yeastar يتربط."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile label="عدد المكالمات" value={fmtInt(callStats.total)} icon={<IconPhone className="h-4 w-4" />} />
                <StatTile label="اتردّ عليها" value={fmtInt(callStats.answered)} tone="ok" />
                <StatTile label="نسبة الرد" value={fmtPct(callStats.pct, 0)} tone={callStats.pct >= 80 ? 'ok' : 'warn'} />
                <StatTile label="إجمالي وقت الكلام" value={fmtDuration(callStats.talk)} />
              </div>
            )}
          </Card>
        </>
      ) : (
        /* ── All-time leaderboard ─────────────────────────────────── */
        <Card as="section">
          <SectionTitle title="ترتيب كل الوقت" subtitle="من sales_person_totals" />
          {allTime.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : allTime.error ? (
            <ErrorState error={allTime.error} onRetry={allTime.reload} />
          ) : (allTime.data ?? []).length === 0 ? (
            <EmptyState title="مفيش بيانات" />
          ) : (
            <TableWrap>
              <table className={cx('w-full text-sm', allTime.refreshing && 'is-refetching')}>
                <thead>
                  <tr className="border-b border-surface-line text-xs text-ink-muted">
                    <th scope="col" className="px-2 py-2 text-start font-medium">#</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">الاسم</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">المحقّق</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">قبل الضريبة</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">صفقات</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">عروض</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">Pipeline</th>
                  </tr>
                </thead>
                <tbody>
                  {(allTime.data ?? []).map((p, i) => (
                    <tr key={`${p.user_name}-${i}`} className="border-b border-surface-line/70 last:border-0">
                      <td className="px-2 py-2 text-ink-faint">{i + 1}</td>
                      <td className="max-w-[180px] truncate px-2 py-2 font-semibold text-navy">{p.user_name ?? '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-bold text-navy">{fmtMoney(p.achieved_total_all)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{fmtMoney(p.achieved_untaxed_all)}</td>
                      <td className="px-2 py-2 text-ink-muted">{fmtInt(p.deals_all)}</td>
                      <td className="px-2 py-2 text-ink-muted">{fmtInt(p.quotations_all)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{fmtMoney(p.pipeline_all)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}
    </div>
  );
}
