-- Engosoft SLA command center — operational schema v2
-- Safe to re-run. Designed for Odoo 17 + Yeastar P-Series + n8n.

begin;

-- ---------------------------------------------------------------------
-- Helpdesk: keep the Odoo timestamps that explain ownership and latency.
-- ---------------------------------------------------------------------
alter table public.fact_ticket add column if not exists write_date timestamptz;
alter table public.fact_ticket add column if not exists assign_date timestamptz;
alter table public.fact_ticket add column if not exists last_stage_update timestamptz;
alter table public.fact_ticket add column if not exists first_response_hours numeric;

alter table public.fact_sla add column if not exists sla_name text;
alter table public.fact_sla add column if not exists exceeded_hours numeric;

-- Recalculate the imported SLA state from timestamps. A reached row is only
-- compliant when it was reached on/before its deadline.
update public.fact_sla
set
  status = case
    when deadline is null then 'ongoing'
    when reached_at is not null and reached_at <= deadline then 'reached'
    when reached_at is not null and reached_at > deadline then 'failed'
    when deadline < now() then 'failed'
    else 'ongoing'
  end,
  exceeded_hours = case
    when deadline is null then null
    when reached_at is not null and reached_at > deadline
      then round((extract(epoch from (reached_at - deadline)) / 3600.0)::numeric, 2)
    when reached_at is null and deadline < now()
      then round((extract(epoch from (now() - deadline)) / 3600.0)::numeric, 2)
    else 0
  end,
  exceeded_days = case
    when deadline is null then null
    when reached_at is not null and reached_at > deadline
      then round((extract(epoch from (reached_at - deadline)) / 86400.0)::numeric, 2)
    when reached_at is null and deadline < now()
      then round((extract(epoch from (now() - deadline)) / 86400.0)::numeric, 2)
    else 0
  end;

-- Tickets without an applicable SLA must be NULL, never counted as compliant.
update public.fact_ticket set sla_failed = null;
update public.fact_ticket t
set sla_failed = s.failed
from (
  select ticket_id, bool_or(status = 'failed') as failed
  from public.fact_sla
  group by ticket_id
) s
where s.ticket_id = t.ticket_id;

create or replace view public.ticket_operational
with (security_invoker = true) as
with sla as (
  select
    ticket_id,
    count(*) as sla_count,
    count(*) filter (where status = 'failed') as sla_failed_count,
    count(*) filter (where status = 'reached') as sla_reached_count,
    min(deadline) filter (where reached_at is null) as sla_deadline,
    max(exceeded_hours) filter (where status = 'failed') as sla_exceeded_hours
  from public.fact_sla
  group by ticket_id
)
select
  t.*,
  coalesce(s.sla_count, 0)::integer as sla_count,
  coalesce(s.sla_failed_count, 0)::integer as sla_failed_count,
  coalesce(s.sla_reached_count, 0)::integer as sla_reached_count,
  s.sla_deadline,
  case
    when coalesce(s.sla_count, 0) = 0 then 'no_sla'
    when coalesce(s.sla_failed_count, 0) > 0 then 'failed'
    when s.sla_deadline is not null then 'ongoing'
    else 'reached'
  end as sla_state,
  case
    when s.sla_deadline is null then null
    else floor(extract(epoch from (s.sla_deadline - now())))::bigint
  end as sla_remaining_seconds,
  s.sla_exceeded_hours
from public.fact_ticket t
left join sla s on s.ticket_id = t.ticket_id;

-- Department metrics now use only tickets with a real SLA in the denominator.
create or replace view public.dept_summary
with (security_invoker = true) as
select
  t.team_name,
  count(*) as total_cnt,
  count(*) filter (where t.is_open) as open_cnt,
  count(*) filter (where t.is_closed) as closed_cnt,
  count(*) filter (where t.is_unassigned and t.is_open) as unassigned_cnt,
  count(*) filter (where t.is_urgent and t.is_open) as urgent_cnt,
  count(*) filter (where t.sla_state = 'failed') as failed_cnt,
  round(avg(t.resolution_hours) filter (where t.is_closed)::numeric, 2) as avg_resolution_hours,
  round(
    100.0 * count(*) filter (where t.sla_state = 'reached')
    / nullif(count(*) filter (where t.sla_state in ('reached', 'failed')), 0),
    2
  ) as sla_met_pct,
  count(*) filter (where t.is_open and now() - t.create_date >= interval '1 day' and now() - t.create_date < interval '3 days') as backlog_1_3,
  count(*) filter (where t.is_open and now() - t.create_date >= interval '3 days' and now() - t.create_date < interval '7 days') as backlog_3_7,
  count(*) filter (where t.is_open and now() - t.create_date >= interval '7 days') as backlog_7p,
  round(avg(t.csat)::numeric, 2) as avg_csat,
  count(*) filter (where t.sla_state in ('reached', 'failed')) as sla_ticket_cnt
from public.ticket_operational t
where t.team_name is not null
  and t.team_name !~* '(moderation|accounting|accountant|مودريشن|محاسب)'
group by t.team_name;

-- ---------------------------------------------------------------------
-- CRM: leads/opportunities are the source of won/lost conversion metrics.
-- ---------------------------------------------------------------------
create table if not exists public.dim_salesperson (
  user_id integer primary key,
  user_name text not null,
  team_id integer,
  team_name text,
  active boolean not null default true,
  extension text,
  synced_at timestamptz not null default now()
);

create table if not exists public.fact_lead (
  lead_id integer primary key,
  lead_name text,
  lead_type text,
  user_id integer,
  user_name text,
  team_id integer,
  team_name text,
  stage_id integer,
  stage_name text,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  active boolean not null default true,
  probability numeric,
  expected_revenue numeric,
  phone text,
  mobile text,
  phone_normalized text,
  create_date timestamptz,
  assigned_at timestamptz,
  last_stage_at timestamptz,
  closed_at timestamptz,
  lost_reason text,
  next_activity_deadline date,
  write_date timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists fact_lead_user_idx on public.fact_lead (user_id);
create index if not exists fact_lead_create_idx on public.fact_lead (create_date);
create index if not exists fact_lead_closed_idx on public.fact_lead (closed_at);
create index if not exists fact_lead_phone_idx on public.fact_lead (phone_normalized);

-- ---------------------------------------------------------------------
-- Yeastar CDR: keep both parties and the remote number for lead matching.
-- ---------------------------------------------------------------------
alter table public.fact_call add column if not exists from_number text;
alter table public.fact_call add column if not exists to_number text;
alter table public.fact_call add column if not exists remote_number text;
alter table public.fact_call add column if not exists remote_normalized text;
alter table public.fact_call add column if not exists call_duration_sec integer;
alter table public.fact_call add column if not exists recording_url text;
alter table public.fact_call add column if not exists trunk_name text;

-- v1 wrote its Config object as every webhook payload. Keep those historical
-- rows for auditability; all operational views below require a real timestamp,
-- mapped owner and/or CDR fields, so this proven bad signature is excluded
-- without deleting source data.

create index if not exists fact_call_user_started_idx on public.fact_call (user_id, started_at);
create index if not exists fact_call_remote_idx on public.fact_call (remote_normalized);

create or replace view public.lead_first_call
with (security_invoker = true) as
select
  l.lead_id,
  c.call_id,
  c.started_at as first_call_at,
  round((extract(epoch from (c.started_at - l.create_date)) / 60.0)::numeric, 2) as first_call_minutes
from public.fact_lead l
left join lateral (
  select fc.call_id, fc.started_at
  from public.fact_call fc
  where fc.direction = 'outbound'
    and fc.user_id = l.user_id
    and fc.remote_normalized is not null
    and fc.remote_normalized = l.phone_normalized
    and fc.started_at >= l.create_date
    and fc.started_at < l.create_date + interval '30 days'
  order by fc.started_at
  limit 1
) c on true;

create or replace view public.sales_rep_monthly
with (security_invoker = true) as
with months as (
  select generate_series(
    date '2026-01-01',
    date_trunc('month', current_date)::date,
    interval '1 month'
  )::date as month
),
roster as (
  select *
  from public.dim_salesperson
  where active
    and coalesce(team_name, '') !~* '(moderation|accounting|accountant|مودريشن|محاسب)'
),
new_leads as (
  select
    date_trunc('month', l.create_date)::date as month,
    l.user_id,
    count(*) as new_leads,
    count(fc.call_id) as contacted_leads,
    round(avg(fc.first_call_minutes) filter (where fc.first_call_minutes >= 0), 2) as avg_first_call_minutes,
    sum(coalesce(l.expected_revenue, 0)) as new_pipeline
  from public.fact_lead l
  left join public.lead_first_call fc on fc.lead_id = l.lead_id
  where l.user_id is not null and l.create_date is not null
  group by 1, 2
),
closed_leads as (
  select
    date_trunc('month', l.closed_at)::date as month,
    l.user_id,
    count(*) filter (where l.is_won) as won_leads,
    count(*) filter (where l.is_lost) as lost_leads,
    sum(coalesce(l.expected_revenue, 0)) filter (where l.is_won) as won_revenue
  from public.fact_lead l
  where l.user_id is not null and l.closed_at is not null
  group by 1, 2
),
calls as (
  select
    date_trunc('month', started_at)::date as month,
    coalesce(fc.user_id, me.user_id) as user_id,
    count(*) filter (where direction = 'outbound') as outbound_calls,
    count(*) filter (where direction = 'outbound' and talk_sec > 0) as answered_calls,
    sum(coalesce(talk_sec, 0)) filter (where direction = 'outbound') as talk_sec
  from public.fact_call fc
  left join public.map_extension me on me.extension = fc.extension
  where coalesce(fc.user_id, me.user_id) is not null and started_at is not null
  group by 1, 2
),
open_now as (
  select user_id, count(*) as open_leads
  from public.fact_lead
  where active and not is_won and not is_lost and user_id is not null
  group by user_id
)
select
  m.month,
  r.user_id,
  r.user_name,
  r.team_name,
  coalesce(o.open_leads, 0)::integer as open_leads,
  coalesce(n.new_leads, 0)::integer as new_leads,
  coalesce(n.contacted_leads, 0)::integer as contacted_leads,
  greatest(coalesce(n.new_leads, 0) - coalesce(n.contacted_leads, 0), 0)::integer as uncontacted_leads,
  n.avg_first_call_minutes,
  coalesce(c.won_leads, 0)::integer as won_leads,
  coalesce(c.lost_leads, 0)::integer as lost_leads,
  coalesce(k.outbound_calls, 0)::integer as outbound_calls,
  coalesce(k.answered_calls, 0)::integer as answered_calls,
  coalesce(k.talk_sec, 0)::bigint as talk_sec,
  coalesce(n.new_pipeline, 0)::numeric as new_pipeline,
  coalesce(c.won_revenue, 0)::numeric as won_revenue,
  round(100.0 * coalesce(n.contacted_leads, 0) / nullif(n.new_leads, 0), 2) as contact_pct,
  round(100.0 * coalesce(c.won_leads, 0) / nullif(coalesce(c.won_leads, 0) + coalesce(c.lost_leads, 0), 0), 2) as conversion_pct,
  round(100.0 * coalesce(k.answered_calls, 0) / nullif(k.outbound_calls, 0), 2) as answer_pct
from months m
cross join roster r
left join new_leads n on n.month = m.month and n.user_id = r.user_id
left join closed_leads c on c.month = m.month and c.user_id = r.user_id
left join calls k on k.month = m.month and k.user_id = r.user_id
left join open_now o on o.user_id = r.user_id;

-- Existing financial metrics stay available, but internal moderation and
-- accounting teams no longer leak into the sales ranking.
create or replace view public.sales_summary
with (security_invoker = true) as
with totals as (
  select
    f.*,
    coalesce(t.target, f.target) as team_target,
    sum(f.achieved_total) over (partition by f.month, f.team_name) as team_achieved
  from public.fact_sales_monthly f
  left join public.team_target_monthly t
    on t.month = f.month and t.team_name = f.team_name
  where coalesce(f.team_name, '') !~* '(moderation|accounting|accountant|مودريشن|محاسب)'
)
select
  month, team_name, user_name, achieved_untaxed, achieved_total,
  deals_count, quotations_count, pipeline_value, team_target,
  round(100.0 * team_achieved / nullif(team_target, 0), 2) as team_attainment_pct
from totals;

create or replace view public.sales_person_totals
with (security_invoker = true) as
with latest_pipeline as (
  select distinct on (user_name) user_name, pipeline_value
  from public.fact_sales_monthly
  where user_name is not null
    and coalesce(team_name, '') !~* '(moderation|accounting|accountant|مودريشن|محاسب)'
  order by user_name, month desc
)
select
  f.user_name,
  sum(f.achieved_total) as achieved_total_all,
  sum(f.achieved_untaxed) as achieved_untaxed_all,
  sum(f.deals_count) as deals_all,
  sum(f.quotations_count) as quotations_all,
  max(lp.pipeline_value) as pipeline_all
from public.fact_sales_monthly f
left join latest_pipeline lp on lp.user_name = f.user_name
where f.user_name is not null
  and coalesce(f.team_name, '') !~* '(moderation|accounting|accountant|مودريشن|محاسب)'
group by f.user_name;

-- ---------------------------------------------------------------------
-- Recruitment: one operational row per Odoo applicant.
-- ---------------------------------------------------------------------
create table if not exists public.fact_recruitment (
  applicant_id integer primary key,
  applicant_name text,
  job_id integer,
  job_name text,
  department_name text,
  stage_id integer,
  stage_name text,
  recruiter_user_id integer,
  recruiter_name text,
  application_status text,
  priority text,
  applied_at timestamptz,
  assigned_at timestamptz,
  last_stage_at timestamptz,
  hired_at timestamptz,
  refused_at timestamptz,
  refuse_reason text,
  next_activity_deadline date,
  next_interview_at timestamptz,
  active boolean not null default true,
  write_date timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists fact_recruitment_stage_idx on public.fact_recruitment (stage_id);
create index if not exists fact_recruitment_job_idx on public.fact_recruitment (job_id);
create index if not exists fact_recruitment_recruiter_idx on public.fact_recruitment (recruiter_user_id);

create or replace view public.recruitment_operational
with (security_invoker = true) as
select
  r.*,
  round((extract(epoch from (now() - r.applied_at)) / 86400.0)::numeric, 1) as age_days,
  round((extract(epoch from (now() - coalesce(r.last_stage_at, r.applied_at))) / 86400.0)::numeric, 1) as stage_age_days,
  case
    when r.application_status = 'hired' then 'hired'
    when r.application_status = 'refused' or not r.active then 'closed'
    when coalesce(r.next_activity_deadline, current_date) < current_date then 'overdue'
    else 'active'
  end as operational_state
from public.fact_recruitment r;

-- ---------------------------------------------------------------------
-- Browser access is read-only; n8n uses the secret key and bypasses RLS.
-- ---------------------------------------------------------------------
alter table public.dim_salesperson enable row level security;
alter table public.fact_lead enable row level security;
alter table public.fact_recruitment enable row level security;

drop policy if exists "anon read" on public.dim_salesperson;
drop policy if exists "anon read" on public.fact_lead;
drop policy if exists "anon read" on public.fact_recruitment;
create policy "anon read" on public.dim_salesperson for select to anon using (true);
create policy "anon read" on public.fact_lead for select to anon using (true);
create policy "anon read" on public.fact_recruitment for select to anon using (true);

grant select on public.fact_ticket, public.fact_sla, public.fact_call,
  public.fact_sales_monthly, public.team_target_monthly, public.dim_salesperson,
  public.fact_lead, public.fact_recruitment to anon;
grant select on public.ticket_operational, public.dept_summary,
  public.lead_first_call, public.sales_rep_monthly, public.sales_summary,
  public.sales_person_totals, public.recruitment_operational to anon;

commit;

-- Verification (expected immediately after migration):
-- select count(*) from public.ticket_operational;
-- select count(*) from public.fact_call; -- v1 corrupt null rows are gone
-- select * from public.sales_rep_monthly order by month desc, user_name limit 20;
-- select * from public.recruitment_operational limit 20;
