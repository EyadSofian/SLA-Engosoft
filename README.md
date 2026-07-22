# لوحة أداء الأقسام — Engosoft

Operations dashboard for Engosoft management: company-wide **helpdesk**, **SLA**,
**sales/CRM/calls**, and **recruitment** performance, read live from Supabase over
PostgREST. Arabic, RTL, mobile-first. Ships with an AI chat assistant, a Telegram
daily digest, and a passcode-gated **management** tab where tasks and meetings
can be filed from the browser or dictated to a Telegram bot in plain Arabic.

- **Stack:** React 18 · Vite · TypeScript · Tailwind CSS · Recharts
- **Data:** Supabase REST (read-only, publishable key, RLS on)
- **AI:** Anthropic Messages API behind a server-side proxy — chat, and Arabic→structured extraction for the management tab
- **Deploy:** Railway (Express) or Vercel (static + serverless functions)

---

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in the two VITE_ values
npm run dev                    # http://localhost:5173
```

The AI chat needs the API process running alongside Vite:

```bash
npm start                      # serves /api/chat (and dist/ in production)
```

Vite proxies `/api` to `http://localhost:$PORT` (default `3000`), so the two
line up automatically.

---

## 1. Database setup (once)

For the v2 operational model, run
[`supabase/operational-schema-v2.sql`](supabase/operational-schema-v2.sql) first.
The production rollout order, metric definitions, and recovery checks are in
[`docs/operations-v2.md`](docs/operations-v2.md).

RLS is on, so the browser cannot read anything until read-only policies exist.
Open the **Supabase SQL Editor** and run [`supabase/policies.sql`](supabase/policies.sql).

It grants `SELECT` — and only `SELECT` — to the `anon` role on:

| Views (dashboard reads these) | Base tables |
| --- | --- |
| `dept_summary` · `sales_summary` · `sales_person_totals` | `fact_ticket` · `fact_sla` · `fact_sales_monthly` · `team_target_monthly` · `fact_call` |

The script is idempotent — re-running it changes nothing.

If `dept_summary` or `sales_person_totals` don't exist yet, run
[`supabase/create-views.sql`](supabase/create-views.sql) first — it builds both
from the base tables and grants them to `anon`.

**Currency lives in config, not in the database.** The amount columns are bare
numbers with no currency column, so `VITE_CURRENCY` / `CURRENCY` are the single
source of truth for the unit. Default is `USD`.

---

## 2. Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build time | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | build time | **publishable** key (`sb_publishable_…`) |
| `ANTHROPIC_API_KEY` | runtime, server | AI chat. Without it the chat returns a clear "not enabled" message; the rest of the dashboard works. |
| `ANTHROPIC_MODEL` | runtime, server | optional, defaults to `claude-sonnet-5` |
| `VITE_CURRENCY` | build time | optional, defaults to `USD`. Also set `CURRENCY` (same value, no prefix) so the digest and AI chat quote the same unit. |
| `PORT` | runtime, server | injected by Railway |
| `SUPABASE_SERVICE_KEY` | runtime, server | **secret** key — management tab only, the one write path in the project |
| `MANAGEMENT_PASSCODE` | runtime, server | opens the management tab; unset = the tab reports "not enabled" |
| `MANAGEMENT_WEBHOOK_SECRET` | runtime, server | shared secret for the Botpress / Telegram intake |
| `MANAGEMENT_JOIN_CODE` | runtime, server | first-contact activation code for chats; unset = no chat-level gate |

The management tab has a few more optional variables (team roster, timezone,
allow-listed chats) — see [`docs/management-ai.md`](docs/management-ai.md) §2.

> **Never put the Supabase `secret` / `service_role` key in a `VITE_` variable.**
> Anything prefixed `VITE_` is inlined into the JavaScript bundle and is public.
> The publishable key is designed for this and is safe — it is what enforces RLS.
>
> `ANTHROPIC_API_KEY` is **not** `VITE_`-prefixed on purpose: it is read only by
> `server/chat-core.js` and never reaches the browser.

---

## 3. Deploy

### Railway (what this repo is set up for)

Railway reads [`railway.json`](railway.json): build `npm run build`, start
`npm start`, health check `/healthz`. One service serves both the static bundle
and `/api/chat`.

1. New Project → Deploy from GitHub → this repo.
2. **Variables** → add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`.
3. Deploy. (The `VITE_` values are read at build time — after changing either
   one you must redeploy, not just restart.)

### Vercel

[`vercel.json`](vercel.json) builds the SPA and exposes `api/chat.js` as a
serverless function. Add the same variables in **Project → Settings → Environment
Variables**.

---

## 4. Telegram daily digest

Two interchangeable options — pick one.

### Option A — n8n (recommended; Engosoft already runs n8n)

1. Import [`n8n/engosoft-daily-digest.json`](n8n/engosoft-daily-digest.json).
2. Replace every `YOUR_SUPABASE_ANON_KEY` placeholder (4 HTTP nodes).
3. Create the bot with [@BotFather](https://t.me/BotFather), add a **Telegram
   credential** in n8n with the token, and set `chat_id` on the Telegram node.
4. Activate. It fires at 08:00 Africa/Cairo.

### Option B — Node script (Railway cron, GitHub Action, or manual)

```bash
npm run digest -- --dry-run     # print the message, send nothing
npm run digest                  # send it
npm run digest -- --weekly      # force the longer Sunday roll-up
```

Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
On Railway, add a second service with start command `npm run digest` and a cron
schedule of `0 6 * * *` (06:00 UTC = 08:00 Cairo in summer).

**What the digest reports:** open / unassigned / urgent / SLA-late per department ·
opened and closed today · departments needing intervention · SLA at-risk within
24h · unassigned older than a day · top 5 sales month-to-date · best and worst
department. On Sundays it appends a per-department weekly roll-up.

---

## 5. Management tab (tasks · meetings · appointments)

`/management` — behind a passcode, and the only part of the project that writes.
Two ways in: the form in the tab, or a Telegram message in plain Egyptian
Arabic that Claude turns into structured rows ("اجتماع مع المبيعات بكرة ٢ الضهر
ساعة، وأحمد يجهّز تقرير التذاكر قبل الخميس" → a meeting with a real timestamp and
a task with an owner). Anything the model wasn't sure about lands in a review
lane instead of looking confirmed.

1. Run [`supabase/management-schema.sql`](supabase/management-schema.sql). It
   creates `mgmt_item`, `mgmt_ingest` and `mgmt_member` with **no anon access** —
   unlike every other table here, this data never reaches the browser's key.
2. Add `SUPABASE_SERVICE_KEY`, `MANAGEMENT_PASSCODE`, `MANAGEMENT_WEBHOOK_SECRET`
   and `MANAGEMENT_JOIN_CODE`, then redeploy.
3. Point the chat front-end at `POST /api/management/ingest` — Botpress Cloud,
   n8n, or Telegram straight at `/api/management/telegram`.

Access from chat is self-service: a new chat sends the join code once and the
server records the id it already saw on the request. No chat id is ever
configured by hand.

Full setup, the API contract, the extraction prompt, and a ready-to-paste
Botpress bot: [`docs/management-ai.md`](docs/management-ai.md) ·
[`docs/botpress-management-bot.md`](docs/botpress-management-bot.md).

---

## Project structure

```
src/
  lib/
    supabase.ts     PostgREST client — select() + exact-count via Content-Range
    metrics.ts      roll-ups, dept health thresholds, agent leaderboard
    format.ts       Arabic number/date/currency + counted-noun agreement
    management.ts   /api/management client, session token, labels, sorting
    theme.ts        chart tokens (validated palettes)
  hooks/            useAsync (no skeleton flash on refetch), refresh, toasts
  components/
    layout/         sidebar (desktop) + bottom nav (mobile)
    charts/         AgingBars, SalesTrend, ChartFrame (table-view twin)
    chat/           floating AI assistant
    management/     passcode gate, item card, create/edit sheet, kind picker
    ui/             Card, StatTile, Ring, Meter, StatusPill, Skeleton, Toast
  pages/            Overview · Departments · DeptDetail · Tickets · Sales ·
                    Recruitment · Management
server/
  chat-core.js        prompt, validation, Anthropic call, error mapping
  management-core.js  passcode session, Supabase writes, Arabic→JSON extraction,
                      Telegram + Botpress webhooks
  index.js            Express: static + /api/chat + /api/management + SPA fallback
api/chat.js                        same chat handler, Vercel signature
api/management/[[...segments]].js  same management router, Vercel signature
scripts/            telegram-digest.js
supabase/           policies.sql · operational-schema-v2.sql · management-schema.sql
docs/               operations-v2.md · management-ai.md · botpress-management-bot.md
n8n/                daily digest workflow
```

---

## Design notes

**Brand.** Navy `#0B2545` · blue `#1D6FB8` · orange `#F5821F` on `#F6F8FB`,
Cairo typeface. Rounded cards with soft shadows; glassmorphism is reserved for
overlay surfaces (the chat panel), never base cards.

**Charts.** Palettes were validated rather than eyeballed:

- **Aging buckets** are *ordered* categories, so they use a single-hue ordinal
  ramp (`#6FA9DA → #1D6FB8 → #0B2545`) — light to dark. A green/amber/red ramp
  would double-encode magnitude the bar length already shows.
- **Sales trend** is a single series, so it uses one colour and no legend box —
  the title names what is plotted.
- **Status** (dots, rings, badges) uses a reserved green/amber/red palette that
  is never reused as a series colour. Green↔red is not distinguishable under
  deuteranopia, so every status colour ships with its Arabic label — colour is
  never the only signal.
- Every chart has a **table view** behind a toggle, so no value is reachable
  only by hovering.
- Orange is a CTA/accent colour only; it fails the 3:1 contrast floor for large
  data marks against a white card.

**Arabic.** Counted nouns follow real agreement rules (`تذكرتين`, `٦ تذاكر`,
`١٢ تذكرة`) via `arCount()` in `src/lib/format.ts` — the usual tell of a
machine-translated UI is `٢ تذكرة`. Digits stay Latin: Egyptian dashboards read
them that way and they align far better in tables and on axes.

**Loading.** Each card resolves independently — one slow query never blocks the
page. Refetches hold the previous render at reduced opacity instead of flashing
back to skeletons.

---

## Notes and limits

- Every reporting page is **read-only** — the browser's Supabase key can only
  `SELECT`. The single write path is the management tab, and it doesn't write
  from the browser either: it calls `/api/management/*`, which holds the secret
  key server-side and checks a passcode token first.
- `fact_ticket` queries are capped at 5,000 rows per department and `fact_call`
  at 5,000 rows per month. Beyond that, move the aggregation into a SQL view.
- The AI assistant is given only the rows fetched for the current question and
  is instructed to rank and explain them, never to invent numbers. It has no
  database access of its own and cannot write anything.
- The calls widget stays empty until Yeastar is wired into `fact_call`; it shows
  an explanatory empty state rather than zeros.
