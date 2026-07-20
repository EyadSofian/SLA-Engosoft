import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { select } from '../lib/supabase';
import type { FactTicket } from '../types/db';
import { NOUN, arCount, fmtCsat, fmtHours, fmtInt, fmtPct, fmtShortDate } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useRefresh } from '../hooks/useRefresh';
import { useErrorToast } from '../hooks/useErrorToast';
import { StatTile } from '../components/ui/Stat';
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
import { IconInbox, IconSearch, IconUrgent } from '../components/Icons';

const COLS =
  'ticket_id,ticket_ref,subject,team_name,agent_name,stage_name,is_open,is_closed,is_unassigned,is_urgent,priority,partner_name,csat,create_date,close_date,resolution_hours,aging_days,sla_failed';

const PAGE = 50;

type Status = 'all' | 'open' | 'closed' | 'unassigned' | 'urgent' | 'failed';

const STATUSES: Array<{ key: Status; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'open', label: 'مفتوح' },
  { key: 'closed', label: 'مقفول' },
  { key: 'unassigned', label: 'غير مُسند' },
  { key: 'urgent', label: 'عاجل' },
  { key: 'failed', label: 'SLA متأخر' },
];

function priorityLabel(p: FactTicket['priority']): string {
  const map: Record<string, string> = { '0': 'عادي', '1': 'متوسط', '2': 'عالي', '3': 'عاجل' };
  if (p == null || p === '') return '—';
  return map[String(p)] ?? String(p);
}

/** Quote a CSV cell; Excel needs the BOM added at download time for Arabic. */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Tickets() {
  const { tick } = useRefresh();

  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shown, setShown] = useState(PAGE);

  const tickets = useAsync(
    () => select<FactTicket>('fact_ticket', { select: COLS, order: 'create_date.desc', limit: 20000 }),
    [tick],
  );
  useErrorToast(tickets.error);

  const teams = useMemo(
    () => [...new Set((tickets.data ?? []).map((t) => t.team_name).filter(Boolean))].sort() as string[],
    [tickets.data],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null;

    return (tickets.data ?? []).filter((t) => {
      if (team && t.team_name !== team) return false;

      if (status === 'open' && !t.is_open) return false;
      if (status === 'closed' && !t.is_closed) return false;
      if (status === 'unassigned' && !t.is_unassigned) return false;
      if (status === 'urgent' && !t.is_urgent) return false;
      if (status === 'failed' && !t.sla_failed) return false;

      if (fromTs || toTs) {
        const ts = t.create_date ? new Date(t.create_date).getTime() : null;
        if (ts == null || Number.isNaN(ts)) return false;
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts > toTs) return false;
      }

      if (q) {
        return [t.ticket_ref, t.subject, t.agent_name, t.partner_name, t.team_name].some((v) =>
          v?.toLowerCase().includes(q),
        );
      }
      return true;
    });
  }, [tickets.data, query, team, status, from, to]);

  /** Summary always describes the filtered set, not the whole table. */
  const summary = useMemo(() => {
    const s = {
      total: rows.length,
      open: 0,
      closed: 0,
      unassigned: 0,
      urgent: 0,
      failed: 0,
      resSum: 0,
      resN: 0,
      csatSum: 0,
      csatN: 0,
      slaN: 0,
      slaOk: 0,
    };
    for (const t of rows) {
      if (t.is_open) s.open += 1;
      if (t.is_closed) s.closed += 1;
      if (t.is_unassigned) s.unassigned += 1;
      if (t.is_urgent) s.urgent += 1;
      if (t.sla_failed) s.failed += 1;
      if (t.resolution_hours != null) {
        s.resSum += t.resolution_hours;
        s.resN += 1;
      }
      if (t.csat != null) {
        s.csatSum += t.csat;
        s.csatN += 1;
      }
      if (t.sla_failed != null) {
        s.slaN += 1;
        if (!t.sla_failed) s.slaOk += 1;
      }
    }
    return {
      ...s,
      avgRes: s.resN ? s.resSum / s.resN : null,
      avgCsat: s.csatN ? s.csatSum / s.csatN : null,
      slaPct: s.slaN ? (s.slaOk / s.slaN) * 100 : null,
    };
  }, [rows]);

  const dirty = Boolean(query || team || from || to || status !== 'all');

  function reset() {
    setQuery('');
    setTeam('');
    setStatus('all');
    setFrom('');
    setTo('');
    setShown(PAGE);
  }

  function exportCsv() {
    const head = ['المرجع', 'الموضوع', 'القسم', 'الموظف', 'المرحلة', 'الأولوية', 'العميل', 'تاريخ الفتح', 'تاريخ القفل', 'ساعات الحل', 'العُمر بالأيام', 'الحالة', 'SLA'];
    const body = rows.map((t) => [
      t.ticket_ref ?? t.ticket_id,
      t.subject,
      t.team_name,
      t.agent_name ?? 'غير مُسند',
      t.stage_name,
      priorityLabel(t.priority),
      t.partner_name,
      t.create_date,
      t.close_date,
      t.resolution_hours,
      t.aging_days,
      t.is_open ? 'مفتوح' : 'مقفول',
      t.sla_failed ? 'متأخر' : t.sla_failed === false ? 'ملتزم' : '—',
    ]);

    const csv = [head, ...body].map((r) => r.map(csvCell).join(',')).join('\n');
    // The BOM is what makes Excel read the Arabic as UTF-8 instead of mojibake.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engosoft-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const field =
    'min-h-[44px] rounded-xl border border-surface-line bg-white px-3 text-sm text-navy focus:border-brand-300';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy">التذاكر</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {tickets.data
              ? dirty
                ? `${arCount(rows.length, NOUN.ticket)} من ${fmtInt(tickets.data.length)}`
                : arCount(rows.length, NOUN.ticket)
              : 'بيحمّل…'}
          </p>
        </div>

        <div className="flex gap-2">
          {dirty && (
            <button
              type="button"
              onClick={reset}
              className="tap min-h-[44px] rounded-xl border border-surface-line bg-white px-3 text-xs font-semibold text-ink-muted transition hover:text-navy"
            >
              مسح الفلاتر
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="tap min-h-[44px] rounded-xl bg-navy px-4 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-40"
          >
            تصدير Excel
          </button>
        </div>
      </div>

      {/* ── Summary of the filtered set ─────────────────────────────── */}
      {tickets.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} lines={0} />
          ))}
        </div>
      ) : tickets.error ? (
        <Card>
          <ErrorState error={tickets.error} onRetry={tickets.reload} />
        </Card>
      ) : (
        <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-4', tickets.refreshing && 'is-refetching')}>
          <StatTile label="الإجمالي" value={fmtInt(summary.total)} icon={<IconInbox className="h-4 w-4" />} />
          <StatTile label="مفتوح" value={fmtInt(summary.open)} tone="brand" />
          <StatTile label="مقفول" value={fmtInt(summary.closed)} tone="ok" />
          <StatTile
            label="غير مُسند"
            value={fmtInt(summary.unassigned)}
            tone={summary.unassigned ? 'warn' : 'neutral'}
          />
          <StatTile
            label="عاجل"
            value={fmtInt(summary.urgent)}
            icon={<IconUrgent className="h-4 w-4" />}
            tone={summary.urgent ? 'warn' : 'neutral'}
          />
          <StatTile label="SLA متأخر" value={fmtInt(summary.failed)} tone={summary.failed ? 'bad' : 'neutral'} />
          <StatTile
            label="التزام SLA"
            value={fmtPct(summary.slaPct)}
            tone={
              summary.slaPct == null ? 'neutral' : summary.slaPct < 80 ? 'bad' : summary.slaPct < 95 ? 'warn' : 'ok'
            }
          />
          <StatTile label="متوسط الحل" value={fmtHours(summary.avgRes)} hint={`تقييم ${fmtCsat(summary.avgCsat)}`} />
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">دوّر في التذاكر</span>
              <IconSearch className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE);
                }}
                placeholder="مرجع، موضوع، موظف، عميل، قسم…"
                className={cx(field, 'w-full ps-9')}
              />
            </label>

            <label className="lg:w-56">
              <span className="sr-only">القسم</span>
              <select
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value);
                  setShown(PAGE);
                }}
                className={cx(field, 'w-full')}
              >
                <option value="">كل الأقسام</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Two date inputs don't fit a 375px viewport side by side, so they
                wrap and shrink instead of pushing the page into h-scroll. */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                <span className="whitespace-nowrap text-xs text-ink-muted">من</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setShown(PAGE);
                  }}
                  className={cx(field, 'w-full min-w-0 sm:w-auto')}
                />
              </label>
              <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                <span className="whitespace-nowrap text-xs text-ink-muted">إلى</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setShown(PAGE);
                  }}
                  className={cx(field, 'w-full min-w-0 sm:w-auto')}
                />
              </label>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:ms-auto">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setStatus(s.key);
                    setShown(PAGE);
                  }}
                  aria-pressed={status === s.key}
                  className={cx(
                    'tap min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold transition',
                    status === s.key
                      ? 'bg-navy text-white'
                      : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <Card as="section">
        <SectionTitle
          title="قائمة التذاكر"
          subtitle={
            rows.length > shown ? `بيعرض ${fmtInt(shown)} من ${fmtInt(rows.length)}` : undefined
          }
        />

        {tickets.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={dirty ? 'مفيش تذاكر بالفلتر ده' : 'مفيش تذاكر'}
            hint={dirty ? 'جرّب توسّع المدة أو تمسح الفلاتر.' : undefined}
          />
        ) : (
          <>
            <TableWrap>
              <table className={cx('w-full text-sm', tickets.refreshing && 'is-refetching')}>
                <thead>
                  <tr className="border-b border-surface-line text-xs text-ink-muted">
                    <th scope="col" className="px-2 py-2 text-start font-medium">المرجع</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">الموضوع</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">القسم</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">الموظف</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">المرحلة</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">الأولوية</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">اتفتحت</th>
                    <th scope="col" className="px-2 py-2 text-start font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((t) => (
                    <tr
                      key={t.ticket_id}
                      className={cx(
                        'border-b border-surface-line/70 last:border-0',
                        t.sla_failed && 'bg-status-badBg/50',
                        !t.sla_failed && t.is_urgent && 'bg-status-warnBg/50',
                      )}
                    >
                      <td className="whitespace-nowrap px-2 py-2 font-semibold text-navy">
                        {t.ticket_ref ?? t.ticket_id}
                      </td>
                      <td className="max-w-[240px] truncate px-2 py-2 text-ink" title={t.subject ?? ''}>
                        {t.subject ?? '—'}
                      </td>
                      <td className="max-w-[130px] truncate px-2 py-2 text-ink-muted">
                        {t.team_name ? (
                          <Link
                            to={`/dept/${encodeURIComponent(t.team_name)}`}
                            className="hover:text-brand-600"
                          >
                            {t.team_name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td dir="auto" className="max-w-[140px] truncate px-2 py-2 text-ink-muted">
                        {t.agent_name ?? <span className="text-[#B45309]">غير مُسند</span>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{t.stage_name ?? '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{priorityLabel(t.priority)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-muted">
                        {fmtShortDate(t.create_date)}
                        {t.is_open && t.aging_days != null && (
                          <span className="ms-1 text-[11px] text-ink-faint">
                            ({arCount(t.aging_days, NOUN.day)})
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <div className="flex gap-1">
                          {t.sla_failed && <Badge tone="bad">SLA متأخر</Badge>}
                          {t.is_urgent && <Badge tone="warn">عاجل</Badge>}
                          {!t.is_open && <Badge tone="ok">مقفولة</Badge>}
                          {t.is_open && !t.sla_failed && !t.is_urgent && <Badge tone="neutral">مفتوحة</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>

            {rows.length > shown && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShown((s) => s + PAGE * 4)}
                  className="tap min-h-[44px] rounded-xl border border-surface-line bg-white px-5 text-sm font-semibold text-navy transition hover:border-brand-200 hover:text-brand-600"
                >
                  عرض المزيد ({fmtInt(rows.length - shown)} فاضلين)
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
