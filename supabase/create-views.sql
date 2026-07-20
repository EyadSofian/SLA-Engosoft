-- ─────────────────────────────────────────────────────────────────────────
-- Engosoft dashboard — the two summary views the app reads.
--
-- `sales_summary` already exists in the project, so it is deliberately NOT
-- touched here. This file creates only what was missing:
--     dept_summary          → Overview, Departments, Department detail
--     sales_person_totals   → Sales → "كل الوقت" tab
--
-- Run once in the Supabase SQL Editor, then run policies.sql (or just the
-- grants at the bottom of this file) so the anon role can read them.
-- Safe to re-run: both are CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────

-- ── dept_summary ─────────────────────────────────────────────────────────
-- One row per team, aggregated from fact_ticket.
--
-- Two deliberate choices worth knowing about:
--   • unassigned_cnt / urgent_cnt count OPEN tickets only. A closed ticket
--     that was once unassigned is not something anyone can act on today.
--   • sla_met_pct ignores tickets with no SLA (sla_failed IS NULL) instead of
--     counting them as met — otherwise teams look better simply by having
--     tickets that no SLA applies to.
create or replace view public.dept_summary as
select
  t.team_name,

  count(*)                                          as total_cnt,
  count(*) filter (where t.is_open)                 as open_cnt,
  count(*) filter (where t.is_closed)               as closed_cnt,
  count(*) filter (where t.is_unassigned and t.is_open) as unassigned_cnt,
  count(*) filter (where t.is_urgent and t.is_open) as urgent_cnt,
  count(*) filter (where t.sla_failed)              as failed_cnt,

  round(avg(t.resolution_hours) filter (where t.is_closed)::numeric, 2)
                                                    as avg_resolution_hours,

  -- % of tickets that had an SLA and did not breach it
  round(
    100.0 * count(*) filter (where t.sla_failed is false)
          / nullif(count(*) filter (where t.sla_failed is not null), 0)
  , 2)                                              as sla_met_pct,

  -- Aging buckets. Non-overlapping, open tickets only — these feed the
  -- ordinal bar chart, so a ticket must land in exactly one bucket.
  count(*) filter (where t.is_open and t.aging_days >= 1 and t.aging_days < 3) as backlog_1_3,
  count(*) filter (where t.is_open and t.aging_days >= 3 and t.aging_days < 7) as backlog_3_7,
  count(*) filter (where t.is_open and t.aging_days >= 7)                      as backlog_7p,

  round(avg(t.csat)::numeric, 2)                    as avg_csat

from public.fact_ticket t
where t.team_name is not null
group by t.team_name;


-- ── sales_person_totals ──────────────────────────────────────────────────
-- All-time totals per person, from fact_sales_monthly.
--
-- Note on pipeline: achieved / deals / quotations are flows and genuinely sum
-- across months. Pipeline is a point-in-time SNAPSHOT — summing it would count
-- the same open opportunity once per month and inflate it wildly. So pipeline
-- takes the most recent month's value instead.
create or replace view public.sales_person_totals as
with latest_pipeline as (
  select distinct on (user_name)
    user_name,
    pipeline_value
  from public.fact_sales_monthly
  where user_name is not null
  order by user_name, month desc
)
select
  f.user_name,
  sum(f.achieved_total)          as achieved_total_all,
  sum(f.achieved_untaxed)        as achieved_untaxed_all,
  sum(f.deals_count)             as deals_all,
  sum(f.quotations_count)        as quotations_all,
  max(lp.pipeline_value)         as pipeline_all
from public.fact_sales_monthly f
left join latest_pipeline lp on lp.user_name = f.user_name
where f.user_name is not null
group by f.user_name;


-- ── expose to the browser ────────────────────────────────────────────────
grant select on public.dept_summary        to anon;
grant select on public.sales_person_totals to anon;


-- ── verify ───────────────────────────────────────────────────────────────
-- Both should return rows. If dept_summary is empty, fact_ticket is empty.
-- select * from public.dept_summary;
-- select * from public.sales_person_totals;
