import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { select } from '../lib/supabase';
import type { DeptSummary, FactTicket } from '../types/db';
import { agentLeaderboard, deptHealth, healthReason } from '../lib/metrics';
import { NOUN, arCount, fmtCountdown, fmtCsat, fmtHours, fmtInt, fmtPct, fmtShortDate, fmtSince } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useRefresh } from '../hooks/useRefresh';
import { useErrorToast } from '../hooks/useErrorToast';
import { StatTile, StatusPill } from '../components/ui/Stat';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  SectionTitle,
  Skeleton,
  SkeletonCard,
  TableWrap,
  cx,
} from '../components/ui/primitives';
import { AgingBars } from '../components/charts/AgingBars';
import { IconBack, IconSearch } from '../components/Icons';

const TICKET_COLS =
  'ticket_id,ticket_ref,subject,team_name,agent_name,stage_name,is_open,is_closed,is_unassigned,is_urgent,priority,partner_name,csat,create_date,close_date,resolution_hours,aging_days,sla_failed,sla_state,sla_deadline,sla_remaining_seconds,sla_exceeded_hours';

const isAtRisk = (t: FactTicket) =>
  t.sla_state === 'ongoing'
  && t.sla_remaining_seconds != null
  && t.sla_remaining_seconds >= 0
  && t.sla_remaining_seconds <= 4 * 3600;

/** Odoo helpdesk stores priority as '0'–'3'; anything else is shown as-is. */
function priorityLabel(p: FactTicket['priority']): string {
  const map: Record<string, string> = { '0': 'عادي', '1': 'متوسط', '2': 'عالي', '3': 'عاجل' };
  if (p == null || p === '') return '—';
  return map[String(p)] ?? String(p);
}

type SortKey = 'aging_days' | 'ticket_ref' | 'agent_name' | 'priority';

export default function DeptDetail() {
  const { team = '' } = useParams();
  const teamName = decodeURIComponent(team);
  const { tick } = useRefresh();

  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'urgent' | 'failed' | 'unassigned'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'aging_days',
    dir: 'desc',
  });

  const dept = useAsync(
    async () => {
      const rows = await select<DeptSummary>('dept_summary', {
        filter: { team_name: `eq.${teamName}` },
        limit: 1,
      });
      return rows[0] ?? null;
    },
    [teamName, tick],
  );

  const tickets = useAsync(
    () =>
      select<FactTicket>('ticket_operational', {
        select: TICKET_COLS,
        filter: { team_name: `eq.${teamName}` },
        order: 'create_date.desc',
        limit: 5000,
      }),
    [teamName, tick],
  );

  useErrorToast(dept.error, tickets.error);

  const agents = useMemo(() => agentLeaderboard(tickets.data ?? []), [tickets.data]);

  const openTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = (tickets.data ?? []).filter((t) => t.is_open);

    if (only === 'urgent') rows = rows.filter((t) => t.is_urgent);
    if (only === 'failed') rows = rows.filter((t) => t.sla_failed);
    if (only === 'unassigned') rows = rows.filter((t) => t.is_unassigned);

    if (q) {
      rows = rows.filter((t) =>
        [t.ticket_ref, t.subject, t.agent_name, t.partner_name]
          .some((v) => v?.toLowerCase().includes(q)),
      );
    }

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ar') * dir;
    });
  }, [tickets.data, query, only, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const d = dept.data;
  const filters = [
    { key: 'all', label: 'الكل' },
    { key: 'urgent', label: 'العاجل' },
    { key: 'failed', label: 'SLA متأخر' },
    { key: 'unassigned', label: 'غير مُسند' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div>
        <Link
          to="/depts"
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted transition hover:text-brand-600"
        >
          <IconBack className="h-3.5 w-3.5" />
          كل الأقسام
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-extrabold text-navy sm:text-2xl">{teamName}</h1>
          {d && <StatusPill health={deptHealth(d)} reason={healthReason(d)} />}
        </div>
        {d && healthReason(d) && <p className="mt-1 text-xs text-ink-muted">{healthReason(d)}</p>}
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      {dept.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} lines={0} />
          ))}
        </div>
      ) : dept.error ? (
        <Card>
          <ErrorState error={dept.error} onRetry={dept.reload} />
        </Card>
      ) : !d ? (
        <Card>
          <EmptyState title="القسم ده مش موجود" hint={`مفيش صف في dept_summary باسم «${teamName}».`} />
        </Card>
      ) : (
        <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-4', dept.refreshing && 'is-refetching')}>
          <StatTile label="مفتوح" value={fmtInt(d.open_cnt)} tone="brand" />
          <StatTile label="مقفول" value={fmtInt(d.closed_cnt)} tone="ok" />
          <StatTile label="غير مُسند" value={fmtInt(d.unassigned_cnt)} tone={d.unassigned_cnt ? 'warn' : 'neutral'} />
          <StatTile label="عاجل" value={fmtInt(d.urgent_cnt)} tone={d.urgent_cnt ? 'warn' : 'neutral'} />
          <StatTile label="SLA متأخر" value={fmtInt(d.failed_cnt)} tone={d.failed_cnt ? 'bad' : 'neutral'} />
          <StatTile
            label="التزام SLA"
            value={fmtPct(d.sla_met_pct)}
            tone={d.sla_met_pct == null ? 'neutral' : d.sla_met_pct < 80 ? 'bad' : d.sla_met_pct < 95 ? 'warn' : 'ok'}
          />
          <StatTile label="متوسط الحل" value={fmtHours(d.avg_resolution_hours)} />
          <StatTile label="متوسط التقييم" value={fmtCsat(d.avg_csat)} />
        </div>
      )}

      {/* ── Aging + leaderboard ───────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {d ? <AgingBars dept={d} /> : <SkeletonCard lines={5} />}

        <Card as="section">
          <SectionTitle
            title="ترتيب الموظفين"
            subtitle={agents.length ? arCount(agents.length, NOUN.agent) : undefined}
          />
          {tickets.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <EmptyState title="مفيش تذاكر للقسم ده" />
          ) : (
            <TableWrap>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-line text-xs text-ink-muted">
                    <th scope="col" className="px-2 py-2 text-start font-medium">الموظف</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">مقفول</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">مفتوح</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">متوسط الحل</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">SLA</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">التقييم</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.agent_name} className="border-b border-surface-line/70 last:border-0">
                      <td className="max-w-[160px] truncate px-2 py-2 font-semibold text-navy">{a.agent_name}</td>
                      <td className="px-2 py-2 font-semibold text-navy">{fmtInt(a.closed)}</td>
                      <td className="px-2 py-2 text-ink-muted">{fmtInt(a.open)}</td>
                      <td className="px-2 py-2 text-ink-muted">{fmtHours(a.avgResolution)}</td>
                      <td className="px-2 py-2">
                        <span
                          className={cx(
                            'font-semibold',
                            a.slaMetPct == null
                              ? 'text-ink-faint'
                              : a.slaMetPct < 80
                                ? 'text-status-bad'
                                : a.slaMetPct < 95
                                  ? 'text-[#B45309]'
                                  : 'text-status-ok',
                          )}
                        >
                          {fmtPct(a.slaMetPct, 0)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-ink-muted">{fmtCsat(a.csat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>

      {/* ── Open tickets ──────────────────────────────────────────── */}
      <Card as="section">
        <SectionTitle
          title="التذاكر المفتوحة"
          subtitle={arCount(openTickets.length, NOUN.ticket)}
        />

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">دوّر في التذاكر</span>
            <IconSearch className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="مرجع، موضوع، موظف، عميل…"
              className="min-h-[44px] w-full rounded-xl border border-surface-line bg-white ps-9 pe-3 text-sm text-navy placeholder:text-ink-faint focus:border-brand-300"
            />
          </label>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setOnly(f.key)}
                aria-pressed={only === f.key}
                className={cx(
                  'tap min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold transition',
                  only === f.key
                    ? 'bg-navy text-white'
                    : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {tickets.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : tickets.error ? (
          <ErrorState error={tickets.error} onRetry={tickets.reload} />
        ) : openTickets.length === 0 ? (
          <EmptyState
            title={query || only !== 'all' ? 'مفيش تذاكر بالفلتر ده' : 'مفيش تذاكر مفتوحة'}
            hint={query || only !== 'all' ? 'جرّب تشيل الفلتر أو تغيّر كلمة البحث.' : 'القسم ده صافي دلوقتي.'}
          />
        ) : (
          <TableWrap>
            <table className={cx('w-full text-sm', tickets.refreshing && 'is-refetching')}>
              <thead>
                <tr className="border-b border-surface-line text-xs text-ink-muted">
                  <SortHeader label="المرجع" active={sort.key === 'ticket_ref'} dir={sort.dir} onClick={() => toggleSort('ticket_ref')} />
                  <th scope="col" className="px-2 py-2 text-start font-medium">الموضوع</th>
                  <SortHeader label="الموظف" active={sort.key === 'agent_name'} dir={sort.dir} onClick={() => toggleSort('agent_name')} />
                  <th scope="col" className="px-2 py-2 text-start font-medium">المرحلة</th>
                  <SortHeader label="الأولوية" active={sort.key === 'priority'} dir={sort.dir} onClick={() => toggleSort('priority')} />
                  <SortHeader label="العُمر" active={sort.key === 'aging_days'} dir={sort.dir} onClick={() => toggleSort('aging_days')} />
                  <th scope="col" className="px-2 py-2 text-start font-medium">SLA</th>
                  <th scope="col" className="px-2 py-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {openTickets.map((t) => (
                  <tr
                    key={t.ticket_id}
                    className={cx(
                      'border-b border-surface-line/70 last:border-0',
                      t.sla_state === 'failed' && 'bg-status-badBg/50',
                      t.sla_state !== 'failed' && (isAtRisk(t) || t.is_urgent) && 'bg-status-warnBg/50',
                    )}
                  >
                    <td className="whitespace-nowrap px-2 py-2 font-semibold text-navy">{t.ticket_ref ?? t.ticket_id}</td>
                    <td className="max-w-[260px] truncate px-2 py-2 text-ink" title={t.subject ?? ''}>
                      {t.subject ?? '—'}
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-2 text-ink-muted">
                      {t.agent_name ?? <span className="text-[#B45309]">غير مُسند</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{t.stage_name ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{priorityLabel(t.priority)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-muted">
                      <span title={fmtShortDate(t.create_date)}>{fmtSince(t.create_date)}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {t.sla_state === 'failed' ? (
                        <span className="font-semibold text-status-bad">{fmtCountdown(t.sla_remaining_seconds)}</span>
                      ) : t.sla_state === 'ongoing' ? (
                        <span className={cx('font-semibold', isAtRisk(t) ? 'text-[#B45309]' : 'text-brand-600')}>{fmtCountdown(t.sla_remaining_seconds)}</span>
                      ) : t.sla_state === 'reached' ? (
                        <span className="font-semibold text-status-ok">تم في الموعد</span>
                      ) : (
                        <span className="text-ink-faint">بدون SLA</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <div className="flex gap-1">
                        {t.sla_state === 'failed' && <Badge tone="bad">SLA متأخر</Badge>}
                        {isAtRisk(t) && <Badge tone="warn">قرب يخلص</Badge>}
                        {t.is_urgent && <Badge tone="warn">عاجل</Badge>}
                        {t.sla_state !== 'failed' && !isAtRisk(t) && !t.is_urgent && <Badge tone="neutral">عادي</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <th scope="col" className="px-2 py-2 text-start font-medium">
      <button
        type="button"
        onClick={onClick}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cx('inline-flex items-center gap-1 transition hover:text-navy', active && 'font-bold text-navy')}
      >
        {label}
        <span aria-hidden="true" className="text-[9px]">
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
