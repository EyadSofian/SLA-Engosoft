-- ─────────────────────────────────────────────────────────────────────────
-- Engosoft — management workspace (مهام / اجتماعات / مواعيد الإدارة)
--
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- SECURITY MODEL — different from the rest of this project on purpose.
-- Every other table here is readable by `anon` because the dashboard reads it
-- straight from the browser with the publishable key. Management items are
-- internal (who owes what, when the board meets), so they are NOT exposed to
-- anon: RLS is on with no anon policy and no anon grant. The browser never
-- talks to these tables — it goes through /api/management/*, which uses the
-- Supabase SECRET key server-side and is gated by a passcode.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- gen_random_uuid() lives in pgcrypto on older projects; new ones have it built in.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- One row per task / meeting / appointment / reminder.
-- Created either from the dashboard tab or from a Telegram message that the
-- AI turned into structured fields.
-- ---------------------------------------------------------------------
create table if not exists public.mgmt_item (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'task'
                 check (kind in ('task', 'meeting', 'appointment', 'reminder', 'decision')),
  title          text not null,
  details        text,
  owner_name     text,
  department     text,
  priority       text not null default 'normal'
                 check (priority in ('urgent', 'high', 'normal', 'low')),
  status         text not null default 'todo'
                 check (status in ('todo', 'doing', 'done', 'cancelled')),
  -- Absolute time. The AI resolves "بكرة الساعة ٢" into a real timestamp
  -- using Africa/Cairo, so nothing downstream has to re-parse Arabic.
  due_at         timestamptz,
  duration_min   integer,
  location       text,
  attendees      text[] not null default '{}',
  tags           text[] not null default '{}',
  -- Provenance: where the row came from and what the human actually wrote.
  source         text not null default 'dashboard'
                 check (source in ('dashboard', 'telegram', 'api')),
  reporter       text,
  chat_id        text,
  message_id     text,
  raw_text       text,
  ai_confidence  numeric,
  ai_model       text,
  -- true = the AI wasn't sure (missing owner, vague time). The tab surfaces
  -- these in a review lane instead of dropping them silently.
  needs_review   boolean not null default false,
  ingest_id      uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  done_at        timestamptz
);

create index if not exists mgmt_item_due_idx     on public.mgmt_item (due_at);
create index if not exists mgmt_item_status_idx  on public.mgmt_item (status);
create index if not exists mgmt_item_owner_idx   on public.mgmt_item (owner_name);
create index if not exists mgmt_item_created_idx on public.mgmt_item (created_at desc);
create index if not exists mgmt_item_review_idx  on public.mgmt_item (needs_review) where needs_review;

-- ---------------------------------------------------------------------
-- Audit log: one row per inbound Telegram message, kept whether or not the
-- extraction succeeded. Without this a failed parse is invisible — the
-- manager types a message, nothing appears, and nobody can say why.
-- ---------------------------------------------------------------------
create table if not exists public.mgmt_ingest (
  id          uuid primary key default gen_random_uuid(),
  source      text not null default 'telegram',
  chat_id     text,
  message_id  text,
  sender      text,
  raw_text    text not null,
  parsed      jsonb,
  item_count  integer not null default 0,
  status      text not null default 'ok' check (status in ('ok', 'failed', 'ignored')),
  error       text,
  model       text,
  created_at  timestamptz not null default now()
);

create index if not exists mgmt_ingest_created_idx on public.mgmt_ingest (created_at desc);

-- Idempotency: Telegram retries a webhook it thinks failed, and Botpress can
-- fire twice on a flaky turn. Same chat + same message = one ingest, ever.
create unique index if not exists mgmt_ingest_message_key
  on public.mgmt_ingest (chat_id, message_id)
  where chat_id is not null and message_id is not null;

-- ---------------------------------------------------------------------
-- Who is allowed to file items from chat.
--
-- Nobody types a chat id anywhere: the first time a person messages the bot
-- they send the join code, the server records the id it already sees on the
-- request, and that chat is trusted from then on. Revoking is deleting a row.
-- ---------------------------------------------------------------------
create table if not exists public.mgmt_member (
  chat_id      text primary key,
  display_name text,
  source       text not null default 'telegram',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at maintenance. Doing this in a trigger rather than in the API
-- means a manual fix in the SQL editor still moves the timestamp.
-- ---------------------------------------------------------------------
create or replace function public.mgmt_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mgmt_item_touch on public.mgmt_item;
create trigger mgmt_item_touch
  before update on public.mgmt_item
  for each row execute function public.mgmt_touch_updated_at();

-- ---------------------------------------------------------------------
-- Lock the browser out. RLS on + no policy = anon reads nothing, even if
-- someone lifts the publishable key out of the JS bundle. The API route
-- uses the secret key, which bypasses RLS.
-- ---------------------------------------------------------------------
alter table public.mgmt_item   enable row level security;
alter table public.mgmt_ingest enable row level security;
alter table public.mgmt_member enable row level security;

drop policy if exists "anon read" on public.mgmt_item;
drop policy if exists "anon read" on public.mgmt_ingest;
drop policy if exists "anon read" on public.mgmt_member;

revoke all on public.mgmt_item   from anon, authenticated;
revoke all on public.mgmt_ingest from anon, authenticated;
revoke all on public.mgmt_member from anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tables exist and are empty:
--      select count(*) from public.mgmt_item;
--      select count(*) from public.mgmt_ingest;
--
-- 2. anon has NO privileges on any of them (expected: zero rows):
--      select table_name, privilege_type
--        from information_schema.role_table_grants
--       where grantee = 'anon'
--         and table_name in ('mgmt_item', 'mgmt_ingest', 'mgmt_member');
--
-- 2b. Who can file from chat, and revoking one:
--      select * from public.mgmt_member;
--      delete from public.mgmt_member where chat_id = '123456789';
--
-- 3. Smoke-test a row (delete it afterwards):
--      insert into public.mgmt_item (kind, title, owner_name, due_at)
--      values ('meeting', 'اجتماع تجريبي', 'الإدارة', now() + interval '1 day');
-- ─────────────────────────────────────────────────────────────────────────
