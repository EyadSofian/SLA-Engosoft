# Management tab + Telegram AI intake

The `/management` tab is where the company's tasks, meetings and appointments
live. Two ways in:

1. **The tab itself** — a form behind a passcode.
2. **Telegram** — whoever runs the day types what's needed in plain Egyptian
   Arabic, Claude turns it into structured rows, and the tab shows them.

```
Telegram ──► Botpress Cloud ──► /api/management/ingest ──► Claude ──► Supabase
   ▲                                    │
   └──── reply: "اتسجّل ٣ بنود…" ◄───────┘

browser ──passcode token──► /api/management/items ──secret key──► Supabase
```

Botpress owns the conversation; this API owns the extraction and the writing.
There's also a Botpress-free path (§5) if you ever want to drop the middle
layer — the same endpoint logic serves both.

Everything that writes goes through the server. The browser never holds a key
that can touch `mgmt_*`, and the Anthropic key stays server-side — same rule as
the AI chat.

---

## 1. Database (once)

Run [`supabase/management-schema.sql`](../supabase/management-schema.sql) in the
Supabase **SQL Editor**. It creates two tables and locks them down:

| Table | What's in it |
| --- | --- |
| `mgmt_item` | one row per task / meeting / appointment / reminder / decision |
| `mgmt_ingest` | one row per inbound Telegram message — kept even when extraction fails |

Unlike the rest of this project, these tables are **not** readable by `anon`.
RLS is on with no policy and no grant, so the publishable key in the JS bundle
cannot read management data even if someone lifts it out. Verification queries
are at the bottom of the SQL file.

---

## 2. Environment variables

Server-side only — none of these are `VITE_`-prefixed.

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | ✅ | same project as the dashboard |
| `SUPABASE_SERVICE_KEY` | ✅ | **secret** key (`sb_secret_…` / service_role). The only write path in the project. |
| `MANAGEMENT_PASSCODE` | ✅ | opens the tab. Unset → the tab and every route return 503. |
| `MANAGEMENT_WEBHOOK_SECRET` | ✅ | shared secret for the ingest/agenda webhooks |
| `MANAGEMENT_JOIN_CODE` | recommended | first-contact activation code. Nobody configures a chat id — see §4. |
| `ANTHROPIC_API_KEY` | recommended | without it messages are still saved, as one raw item flagged for review |
| `TELEGRAM_BOT_TOKEN` | direct route only | lets the server reply in the chat itself. Not needed with Botpress — Botpress sends the reply. |
| `TELEGRAM_WEBHOOK_SECRET` | direct route only | defaults to `MANAGEMENT_WEBHOOK_SECRET` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | rarely | hard allow-list for the direct route. Leave empty — `MANAGEMENT_JOIN_CODE` is the gate. |
| `MANAGEMENT_TEAM` | optional | `عياد,منى,أحمد` — canonical spellings for the model and the form's autocomplete |
| `MANAGEMENT_DEPARTMENTS` | optional | same idea for departments |
| `MANAGEMENT_MODEL` | optional | defaults to `claude-opus-4-8` |
| `MANAGEMENT_TIMEZONE` | optional | defaults to `Africa/Cairo` — what "بكرة الساعة ٢" is resolved against |
| `MANAGEMENT_SESSION_SECRET` | optional | signs session tokens; defaults to the passcode |
| `MANAGEMENT_SESSION_HOURS` | optional | session lifetime, default 12 |

After adding them on Railway, **redeploy** — the process reads them at boot.

---

## 3. The API

Base: `https://<your-app>/api/management`

### Passcode routes (browser)

| Method | Path | Body / notes |
| --- | --- | --- |
| `POST` | `/session` | `{"passcode":"…"}` → `{ token, team, departments, … }`. 8 attempts per IP per 10 min. |
| `GET` | `/items?status=open&days=120` | needs `Authorization: Bearer <token>` |
| `POST` | `/items` | create |
| `PATCH` | `/items/<id>` | update — only whitelisted fields |
| `DELETE` | `/items/<id>` | delete |
| `GET` | `/inbox?limit=20` | recent Telegram messages |
| `GET` | `/today?day_offset=0` | agenda as data |

### Webhook routes (machine)

Both require the shared secret in a header — `x-engosoft-secret`, or
`x-telegram-bot-api-secret-token` (what Telegram itself sends).

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/telegram` | a raw Telegram `update` object. Handles `/start`, `/help`, `/today`, replies in the chat. |
| `POST` | `/ingest` | generic intake for Botpress / n8n / anything else |
| `GET` | `/agenda?day_offset=0` | `{ due, overdue, text }` — the text is ready to send as a message |

#### `POST /ingest`

Send the raw text and let the server extract (**recommended** — one prompt to
maintain, and the fallback path is already handled):

```json
{
  "text": "اجتماع مع فريق المبيعات بكرة ٢ الضهر ساعة، وأحمد يجهّز تقرير التذاكر المتأخرة قبل الخميس",
  "sender": "عياد سفيان",
  "chat_id": "123456789",
  "message_id": "4417"
}
```

Or send items you extracted yourself — same JSON shape the model produces
(see §6). Either way the server re-validates every field before it writes:

```json
{
  "sender": "عياد سفيان",
  "chat_id": "123456789",
  "message_id": "4417",
  "items": [ { "kind": "meeting", "title": "…", "due_at": "2026-07-23T14:00:00+03:00", "…": "…" } ]
}
```

Response:

```json
{ "ok": true, "count": 2, "summary": "…", "reply": "اتسجّل بندين: …", "items": [ … ] }
```

`reply` is written for a human — send it straight back to the chat.
`chat_id` + `message_id` make the call **idempotent**: a retried delivery
returns `{"duplicate": true}` and writes nothing.

---

## 4. Who is allowed to file — first-contact activation

A Telegram bot is reachable by anyone who finds its @username, whatever sits in
front of it. Set `MANAGEMENT_JOIN_CODE` and a new chat has to send that code
once before it can write anything:

```
manager ──► "اجتماع بكرة ٢"   ──► "الشات ده لسه مش مفعّل. ابعت كود الانضمام…"
manager ──► "8412"            ──► "تمام، الشات ده اتفعّل…"     → row in mgmt_member
manager ──► "اجتماع بكرة ٢"   ──► "اتسجّل بند واحد: …"
```

**No chat id is ever configured or looked up.** The server records the id it
already sees on the request. Messages from an unactivated chat write nothing —
not even a log row — so a stranger can't fill the inbox either.

Give the code to the managers once. To see or revoke access:

```sql
select * from public.mgmt_member;
delete from public.mgmt_member where chat_id = '123456789';
```

Leave `MANAGEMENT_JOIN_CODE` unset while testing and there's no chat-level
gate at all.

---

## 5. Front-ends

### Botpress Cloud (what this project is set up for)

Botpress's own Telegram integration handles the channel and the reply; one
Execute Code card posts to `/ingest` and prints what comes back. The Autonomous
Node prompt (English), both transition conditions, and the card are in
[`docs/botpress-management-bot.md`](botpress-management-bot.md).

> Outbound HTTP from an Execute Code card is blocked on the Botpress **free**
> plan (`axios is not defined`). Filing needs a paid plan, or n8n as the relay.

### n8n

Telegram Trigger → HTTP Request `POST /api/management/ingest` with header
`x-engosoft-secret` and body `{text, sender, chat_id, message_id}` → Telegram
node replying with `{{ $json.reply }}`.

### Telegram straight to this server (no middle layer)

Only worth it if you'd rather not run a bot platform at all. `/api/management/telegram`
speaks Telegram's own webhook format and handles `/start`, `/help`, `/today`,
`/join <code>`, and plain Arabic text:

```bash
curl -sS "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -H "Content-Type: application/json" -d '{"url":"https://<your-app>/api/management/telegram","secret_token":"<TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message","edited_message"]}'
```

`secret_token` accepts only `A–Z a–z 0–9 _ -`. This route needs
`TELEGRAM_BOT_TOKEN` so the server can reply; the Botpress route doesn't.
The daily digest can share the same bot token — it only *sends*, and a webhook
only disables `getUpdates` polling, which the digest doesn't use.

---

## 6. The extraction prompt

It lives in code, as `EXTRACTION_PROMPT` in
[`server/management-core.js`](../server/management-core.js) — one copy, so the
prompt and the schema can't drift apart. The model is called with structured
outputs, so the response is schema-valid JSON rather than something to parse
defensively:

```jsonc
{
  "items": [{
    "kind": "task | meeting | appointment | reminder | decision",
    "title": "جملة قصيرة",
    "details": "",
    "owner_name": "",
    "department": "",
    "priority": "urgent | high | normal | low",
    "due_at": "2026-07-23T14:00:00+03:00",   // "" when no time was mentioned
    "duration_min": 60,                       // 0 when not mentioned
    "location": "",
    "attendees": [],
    "tags": [],
    "confidence": 0.9,
    "needs_review": false
  }],
  "summary": "سطر واحد",
  "reply": "رسالة قصيرة للمسؤول في تليجرام"
}
```

Rules that matter:

- **Nothing is invented.** Missing information stays `""` / `0` / `[]`.
- **Times are absolute.** The model gets `now` in `Africa/Cairo` (DST-aware,
  computed per request) and returns a real offset, so nothing downstream
  re-parses Arabic dates.
- **Uncertainty is visible.** `needs_review` — or a confidence under 0.5, or a
  meeting with no owner/time — puts the row in the review lane instead of
  letting it look confirmed.
- The message body is treated as data: instructions inside it are ignored.

Every value is re-validated server-side (`normalizeItem`) before it reaches the
database — enum members, string lengths, array caps, and a five-year sanity
bound on dates. A wrong or hostile payload can't write a bad row.

---

## 7. Failure behaviour

| What breaks | What happens |
| --- | --- |
| Tables not created | 503 + "شغّل ملف management-schema.sql" in the tab |
| `MANAGEMENT_PASSCODE` unset | 503 on every route, tab shows the reason |
| `ANTHROPIC_API_KEY` unset | message saved as one raw item, `needs_review = true` |
| Extraction fails / model refuses | `mgmt_ingest` row with `status = 'failed'` and the error, visible in the tab |
| Telegram retries a delivery | second call returns `duplicate: true`, nothing written twice |
| Message from an unactivated chat | `blocked: true` + a reply asking for the join code; nothing written, not even a log row |
| Wrong or missing webhook secret | 401, nothing written |
| Session token expired | 401 → the tab drops back to the passcode screen |

Nothing fails silently: every inbound message leaves a row in `mgmt_ingest`
whether or not it produced items.
