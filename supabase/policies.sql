-- ─────────────────────────────────────────────────────────────────────────
-- Engosoft dashboard — read-only access for the browser (anon role).
--
-- Run once in the Supabase SQL Editor. Safe to re-run: every statement is
-- idempotent, so a second run changes nothing.
--
-- This grants SELECT and nothing else. The anon role cannot insert, update
-- or delete through PostgREST after this script.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Turn RLS on. Without this, table privileges alone decide access.
alter table public.fact_ticket         enable row level security;
alter table public.fact_sla            enable row level security;
alter table public.fact_sales_monthly  enable row level security;
alter table public.team_target_monthly enable row level security;
alter table public.fact_call           enable row level security;

-- 2. Allow the anon role to read every row.
--    Dropped first so re-running doesn't fail on "policy already exists".
drop policy if exists "anon read" on public.fact_ticket;
drop policy if exists "anon read" on public.fact_sla;
drop policy if exists "anon read" on public.fact_sales_monthly;
drop policy if exists "anon read" on public.team_target_monthly;
drop policy if exists "anon read" on public.fact_call;

create policy "anon read" on public.fact_ticket         for select to anon using (true);
create policy "anon read" on public.fact_sla            for select to anon using (true);
create policy "anon read" on public.fact_sales_monthly  for select to anon using (true);
create policy "anon read" on public.team_target_monthly for select to anon using (true);
create policy "anon read" on public.fact_call           for select to anon using (true);

-- 3. Table-level SELECT privilege. RLS narrows access; it never grants it,
--    so both the policy above and this grant are required.
grant select on public.fact_ticket         to anon;
grant select on public.fact_sla            to anon;
grant select on public.fact_sales_monthly  to anon;
grant select on public.team_target_monthly to anon;
grant select on public.fact_call           to anon;

-- 4. Expose the views the dashboard reads.
grant select on public.dept_summary       to anon;
grant select on public.sales_summary      to anon;
grant select on public.sales_person_totals to anon;

-- ─────────────────────────────────────────────────────────────────────────
-- Verify: this should return one row per table/view listed above.
-- ─────────────────────────────────────────────────────────────────────────
-- select table_name, privilege_type
--   from information_schema.role_table_grants
--  where grantee = 'anon' and table_schema = 'public'
--  order by table_name;

-- ─────────────────────────────────────────────────────────────────────────
-- Note on views: a view created by the postgres superuser runs with the
-- owner's rights, so it reads the base tables regardless of their RLS. The
-- grants in step 4 are what actually expose it to anon. If you would rather
-- the views respect the base-table policies, recreate them with:
--     alter view public.dept_summary set (security_invoker = on);
-- (Postgres 15+.) The policies in step 2 already allow the same reads, so
-- either way the dashboard works.
-- ─────────────────────────────────────────────────────────────────────────
