import type { DeptSummary, FactTicket, SalesSummary } from '../types/db';
import { NOUN, arCount } from './format';

export type Health = 'ok' | 'warn' | 'bad';

export const HEALTH_LABEL: Record<Health, string> = {
  ok: 'منتظم',
  warn: 'محتاج متابعة',
  bad: 'محتاج تدخّل',
};

/** Thresholds live here so the cards, the digest and the AI answers all agree. */
export const SLA_BAD = 80;
export const SLA_WARN = 95;
export const BACKLOG_7P_BAD = 10;

/**
 * A department's traffic light. Deliberately conservative: anything sitting
 * more than a week, or an SLA under 80%, is red regardless of the other numbers.
 */
export function deptHealth(d: DeptSummary): Health {
  const sla = d.sla_met_pct;
  if ((sla != null && sla < SLA_BAD) || d.backlog_7p >= BACKLOG_7P_BAD) return 'bad';
  if ((sla != null && sla < SLA_WARN) || d.backlog_7p > 0 || d.unassigned_cnt > 3) return 'warn';
  return 'ok';
}

/** Why a department is amber/red, in words — used on cards and in the digest. */
export function healthReason(d: DeptSummary): string | null {
  const reasons: string[] = [];
  if (d.sla_met_pct != null && d.sla_met_pct < SLA_WARN) {
    reasons.push(`SLA ${d.sla_met_pct.toFixed(0)}%`);
  }
  if (d.backlog_7p > 0) reasons.push(`${arCount(d.backlog_7p, NOUN.ticket)} فاتت أسبوع`);
  if (d.unassigned_cnt > 3) reasons.push(`${arCount(d.unassigned_cnt, NOUN.ticket)} غير مُسندة`);
  return reasons.length ? reasons.join(' · ') : null;
}

export interface Totals {
  open: number;
  closed: number;
  unassigned: number;
  urgent: number;
  failed: number;
  total: number;
  slaMetPct: number | null;
}

/** Company-wide roll-up. SLA% is weighted by ticket volume, not a mean of means. */
export function rollUp(rows: DeptSummary[]): Totals {
  const t: Totals = {
    open: 0,
    closed: 0,
    unassigned: 0,
    urgent: 0,
    failed: 0,
    total: 0,
    slaMetPct: null,
  };

  let weighted = 0;
  let weight = 0;

  for (const r of rows) {
    t.open += r.open_cnt ?? 0;
    t.closed += r.closed_cnt ?? 0;
    t.unassigned += r.unassigned_cnt ?? 0;
    t.urgent += r.urgent_cnt ?? 0;
    t.failed += r.failed_cnt ?? 0;
    t.total += r.total_cnt ?? 0;

    if (r.sla_met_pct != null && r.total_cnt > 0) {
      weighted += r.sla_met_pct * r.total_cnt;
      weight += r.total_cnt;
    }
  }

  t.slaMetPct = weight > 0 ? weighted / weight : null;
  return t;
}

export interface AgentStats {
  agent_name: string;
  closed: number;
  open: number;
  avgResolution: number | null;
  slaMetPct: number | null;
  csat: number | null;
}

/** Per-agent leaderboard built client-side from the team's ticket rows. */
export function agentLeaderboard(tickets: FactTicket[]): AgentStats[] {
  const byAgent = new Map<
    string,
    { closed: number; open: number; resSum: number; resN: number; slaN: number; slaOk: number; csatSum: number; csatN: number }
  >();

  for (const t of tickets) {
    const name = t.agent_name?.trim() || 'غير مُسند';
    let a = byAgent.get(name);
    if (!a) {
      a = { closed: 0, open: 0, resSum: 0, resN: 0, slaN: 0, slaOk: 0, csatSum: 0, csatN: 0 };
      byAgent.set(name, a);
    }

    if (t.is_closed) a.closed += 1;
    if (t.is_open) a.open += 1;
    if (t.resolution_hours != null) {
      a.resSum += t.resolution_hours;
      a.resN += 1;
    }
    if (t.sla_failed != null) {
      a.slaN += 1;
      if (!t.sla_failed) a.slaOk += 1;
    }
    if (t.csat != null) {
      a.csatSum += t.csat;
      a.csatN += 1;
    }
  }

  return [...byAgent.entries()]
    .map(([agent_name, a]) => ({
      agent_name,
      closed: a.closed,
      open: a.open,
      avgResolution: a.resN ? a.resSum / a.resN : null,
      slaMetPct: a.slaN ? (a.slaOk / a.slaN) * 100 : null,
      csat: a.csatN ? a.csatSum / a.csatN : null,
    }))
    .sort((x, y) => y.closed - x.closed);
}

export interface MonthTotals {
  month: string;
  achieved: number;
  deals: number;
  pipeline: number;
}

/** Company sales per month, oldest → newest (chart order). */
export function salesByMonth(rows: SalesSummary[]): MonthTotals[] {
  const byMonth = new Map<string, MonthTotals>();

  for (const r of rows) {
    if (!r.month) continue;
    let m = byMonth.get(r.month);
    if (!m) {
      m = { month: r.month, achieved: 0, deals: 0, pipeline: 0 };
      byMonth.set(r.month, m);
    }
    m.achieved += r.achieved_total ?? 0;
    m.deals += r.deals_count ?? 0;
    m.pipeline += r.pipeline_value ?? 0;
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Distinct months present in the data, newest first. */
export function monthsOf(rows: SalesSummary[]): string[] {
  return [...new Set(rows.map((r) => r.month).filter(Boolean))].sort((a, b) => b.localeCompare(a));
}
