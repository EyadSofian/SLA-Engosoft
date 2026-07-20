/** Row shapes for the Supabase tables & views this dashboard reads. */

/** View: per-department helpdesk metrics. Main source for Overview + Dept tabs. */
export interface DeptSummary {
  team_name: string;
  total_cnt: number;
  open_cnt: number;
  closed_cnt: number;
  unassigned_cnt: number;
  urgent_cnt: number;
  failed_cnt: number;
  avg_resolution_hours: number | null;
  sla_met_pct: number | null;
  backlog_1_3: number;
  backlog_3_7: number;
  backlog_7p: number;
  avg_csat: number | null;
}

/** Ticket-level facts — drill-down tables, agent leaderboards. */
export interface FactTicket {
  ticket_id: number;
  ticket_ref: string | null;
  subject: string | null;
  team_name: string | null;
  agent_user_id: number | null;
  agent_name: string | null;
  stage_name: string | null;
  is_open: boolean;
  is_closed: boolean;
  is_unassigned: boolean;
  is_urgent: boolean;
  priority: string | number | null;
  partner_name: string | null;
  csat: number | null;
  create_date: string | null;
  close_date: string | null;
  resolution_hours: number | null;
  aging_days: number | null;
  sla_failed: boolean | null;
  synced_at?: string | null;
}

export type SlaStatus = 'reached' | 'failed' | 'ongoing';

export interface FactSla {
  sla_status_id: number;
  ticket_id: number;
  sla_id: number | null;
  deadline: string | null;
  reached_at: string | null;
  status: SlaStatus | null;
  exceeded_days: number | null;
}

/** View: per-person, per-month sales. */
export interface SalesSummary {
  month: string;
  team_name: string | null;
  user_name: string | null;
  achieved_untaxed: number | null;
  achieved_total: number | null;
  deals_count: number | null;
  quotations_count: number | null;
  pipeline_value: number | null;
  team_target: number | null;
  team_attainment_pct: number | null;
}

/** View: per-person all-time sales totals. */
export interface SalesPersonTotals {
  user_name: string | null;
  achieved_total_all: number | null;
  achieved_untaxed_all: number | null;
  deals_all: number | null;
  quotations_all: number | null;
  pipeline_all: number | null;
}

export interface TeamTargetMonthly {
  month: string;
  team_name: string;
  target: number | null;
}

export type CallDirection = 'inbound' | 'outbound' | string;

export interface FactCall {
  call_id: string | number;
  extension: string | null;
  user_id: number | null;
  direction: CallDirection | null;
  ring_sec: number | null;
  talk_sec: number | null;
  disposition: string | null;
  started_at: string | null;
}
