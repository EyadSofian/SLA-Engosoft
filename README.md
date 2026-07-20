# لوحة أداء الأقسام — Engosoft

Read-only analytics dashboard for Engosoft management: company-wide **helpdesk**
and **sales** performance, read live from Supabase over PostgREST. Arabic, RTL,
mobile-first. Ships with an AI chat assistant and a Telegram daily digest.

- **Stack:** React 18 · Vite · TypeScript · Tailwind CSS · Recharts
- **Data:** Supabase REST (read-only, publishable key, RLS on)
- **AI chat:** Anthropic Messages API behind a server-side proxy
- **Deploy:** Railway (Express) or Vercel (static + serverless function)

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

## Project structure

```
src/
  lib/
    supabase.ts     PostgREST client — select() + exact-count via Content-Range
    metrics.ts      roll-ups, dept health thresholds, agent leaderboard
    format.ts       Arabic number/date/currency + counted-noun agreement
    theme.ts        chart tokens (validated palettes)
  hooks/            useAsync (no skeleton flash on refetch), refresh, toasts
  components/
    layout/         sidebar (desktop) + bottom nav (mobile)
    charts/         AgingBars, SalesTrend, ChartFrame (table-view twin)
    chat/           floating AI assistant
    ui/             Card, StatTile, Ring, Meter, StatusPill, Skeleton, Toast
  pages/            Overview · Departments · DeptDetail · Sales
server/
  chat-core.js      prompt, validation, Anthropic call, error mapping
  index.js          Express: static + /api/chat + SPA fallback
api/chat.js         same handler, Vercel signature
scripts/            telegram-digest.js
supabase/           policies.sql
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

- The dashboard is **read-only**. There is no write path anywhere in the client.
- `fact_ticket` queries are capped at 5,000 rows per department and `fact_call`
  at 5,000 rows per month. Beyond that, move the aggregation into a SQL view.
- The AI assistant is given only the rows fetched for the current question and
  is instructed to rank and explain them, never to invent numbers. It has no
  database access of its own and cannot write anything.
- The calls widget stays empty until Yeastar is wired into `fact_call`; it shows
  an explanatory empty state rather than zeros.
