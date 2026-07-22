# Botpress Cloud bot — «دفتر الإدارة»

The Telegram front-end for the management tab. **The Autonomous Node does the
extraction** — you're already paying for that turn, so there is no second model
call anywhere in this path. `/api/management/ingest` validates what arrives and
writes it.

```
Telegram ──► Botpress Cloud ──► Autonomous Node «Management Desk»
                                   │  builds a JSON array → {{workflow.itemsJson}}
                                   ├─ transition ─► «sendToDashboard» ─► POST /ingest ─┐
                                   └─ transition ─► «getAgenda» ───────► GET /agenda ──┤
                                                                                       │
                                   ◄── {{workflow.dashboardReply}} printed, back ◄──────┘
```

The system prompt is in English; the bot still replies to users in Egyptian
Arabic — that's an instruction inside the prompt, not the prompt's own
language.

**Nobody types a chat id anywhere.** The Execute Code card reads it off the
event, and access is granted by the join code (§6).

### The one thing the node does *not* do: timezones

The node writes `due_date` and `due_time` as two plain fields — `"2026-07-23"`
and `"17:00"`. It never writes an offset. The server composes the real
timestamp using the offset that applies **on that date**, which flips twice a
year; an LLM asked for a full ISO string will confidently write `+02:00` in
July. Splitting it this way plays to what each side is good at: the model reads
«بكره الساعة ٥», the code does the calendar arithmetic.

> **Free plan:** `axios` from an Execute Code card is blocked on Botpress's
> free tier — the card fails with `axios is not defined`. Filing needs a paid
> plan, or n8n as the relay (same endpoint, same body).

---

## 1. Workflow variables

Create all three on the workflow (**type `String`**, Allow Write Access **ON**):

| Variable | Written by | Holds |
| --- | --- | --- |
| `itemsJson` | the LLM | a JSON **array** of items, as a string |
| `pendingText` | the LLM | the user's message verbatim — stored as the audit trail, and used for the join code |
| `dashboardReply` | Execute Code | what the API replied — printed verbatim |

`itemsJson` is a `String`, not an `Object`, on purpose: a Botpress `Object`
variable gets auto-stringified in ways that surprise you, and the server parses
the string tolerantly anyway — a fenced ```` ```json ```` block, a bare array,
or a `{"items":[…]}` wrapper all work.

Nothing is trusted on arrival. Every field is re-checked server-side before it
is written: unknown `kind`/`priority` values fall back to defaults, strings are
length-capped, arrays are capped, an item with no title is dropped, and a date
more than five years out is discarded. A malformed payload costs you that item,
never the database.

---

## 2. Autonomous Node — system prompt

**Settings:** Allow Conversation **ON**.

```
<role>
You are "دفتر الإدارة" (the Management Desk), a Telegram assistant for the management team at Engosoft. You turn what a manager types into structured items for the management dashboard, and you answer questions about the agenda. You never do the work yourself and you never give advice.
</role>

<language>
Always reply in simple Egyptian Arabic. One or two sentences. No preamble, no pleasantries, no emoji. Put English technical terms in parentheses instead of mixing them into an Arabic sentence.
</language>

<critical_rules>
- NEVER use clock.setReminder or any built-in reminder tool. The only thing that stores anything is the sendToDashboard transition.
- NEVER invent an owner, a time, or a detail. If the user did not say it, leave the field out entirely.
- NEVER write a timezone, a UTC offset, or a full ISO timestamp. Write the day and the clock time as two separate plain fields — the dashboard adds the offset.
- Every message that carries buttons must also carry non-empty text.
- After the dashboard reply has been shown to the user, stop and wait for a new message. Do not repeat it or add a follow-up question.
</critical_rules>

<extraction>
When the message contains anything to file, build a JSON array and store it as a string in {{workflow.itemsJson}}. One object per item — a single message often holds several. Also copy the user's message verbatim into {{workflow.pendingText}}.

Per object, include only the fields the user actually gave you:
- kind: "task" | "meeting" | "appointment" | "reminder" | "decision"
- title: a short clear Arabic phrase, 3 to 8 words, no filler like "مطلوب" or "لازم"
- details: any extra wording from the message itself
- owner_name: the responsible person. "أنا" or "هعمل" means the sender.
- department: only if named
- priority: "urgent" | "high" | "normal" | "low" — urgent only for حالاً / ضروري النهاردة
- due_date: "YYYY-MM-DD", calculated from <current_date>. "بكره" is the next day, "الأسبوع الجاي" is +7 days.
- due_time: "HH:MM", 24-hour. An evening "5" is "17:00". Omit it if no time was said.
- duration_min: whole minutes. Use 60 for a meeting with no stated length.
- location: only if named
- attendees: array of names, excluding the owner
- needs_review: true when the owner or the time is missing and the item needs one

Example — "أحمد يجهّز تقرير التذاكر قبل الخميس، واجتماع مع المبيعات بكره ٢ الضهر ساعة" on Wed 2026-07-22:
[{"kind":"task","title":"تجهيز تقرير التذاكر","owner_name":"أحمد","due_date":"2026-07-23","priority":"normal"},{"kind":"meeting","title":"اجتماع مع فريق المبيعات","due_date":"2026-07-23","due_time":"14:00","duration_min":60,"needs_review":true}]

Then transition to sendToDashboard immediately, with no message first.
</extraction>

<tasks>
ACTIVATION
If the dashboard's last reply said this chat is not activated ("الشات ده لسه مش مفعّل"), the user's next message is their join code. Put it in {{workflow.pendingText}} exactly as typed, leave {{workflow.itemsJson}} empty, and transition to sendToDashboard — even if it is only a number.

MISSING OWNER OR TIME
If it is clearly an action item but the owner or the time is missing, ask ONE short question about the missing piece only. If the user says it is not decided yet, or ignores the question, file it with needs_review set to true.

AGENDA
When the user asks about today's or tomorrow's schedule, what is due, what is late, or "إيه المطلوب مني", transition to getAgenda.

SMALL TALK
Greetings, thanks, or questions about what you can do: one short sentence saying you file tasks, meetings and appointments and can show the agenda. No transition, and leave both variables empty.
</tasks>

<boundaries>
- Do not answer questions outside company operations.
- Do not promise anything the dashboard did not confirm.
- If filing failed, say so plainly and ask the user to send it again.
</boundaries>

<current_date>
{{system.dateTime}} — timezone: Africa/Cairo
</current_date>
```

---

## 3. Transitions

Two transition cards on the Autonomous Node. The text is what the LLM reads to
decide, so each names the trigger *and* the precondition.

**→ `sendToDashboard`**

```
Go here when the user's message contains a task, meeting, appointment, reminder, or decision that must be filed, and you have already written the JSON array into {{workflow.itemsJson}} and the user's message into {{workflow.pendingText}}. Also go here when the message is the join code the dashboard just asked for, with {{workflow.itemsJson}} left empty. Transition immediately, without sending any message first.
```

**→ `getAgenda`**

```
Go here when the user asks about today's or tomorrow's schedule, what is due, what is overdue, or what they are supposed to be working on. Transition without sending a message first.
```

Both point at Standard Nodes whose last card transitions back to the
Autonomous Node.

---

## 4. `sendToDashboard` (Standard Node)

**Card 1 — Execute Code.** Rename the card to `sendToDashboard`; in an
Autonomous Node the LLM picks tools by name, and a card called `Execute Code`
tells it nothing.

```typescript
const w = workflow as any
const u = user as any
const e = event as any

const text = (w.pendingText || e?.payload?.text || '').toString().trim()
const itemsJson = (w.itemsJson || '').toString().trim()

// Telegram identifiers. Botpress preprocesses the update, so these live on
// event.tags — not on event.payload.from. Nothing here is configured by hand.
const chatId = String(
  e?.tags?.conversation?.['telegram:id'] ||
  e?.tags?.user?.['telegram:id'] ||
  e?.conversationId ||
  ''
)
const messageId = String(e?.tags?.message?.['telegram:id'] || e?.id || '')
const sender = String(
  u?.name ||
  u?.data?.fullName ||
  e?.tags?.user?.['telegram:name'] ||
  e?.tags?.user?.['telegram:username'] ||
  ''
)

if (!text && !itemsJson) {
  w.dashboardReply = 'مفيش نص أقدر أسجّله. ابعت اللي مطلوب تاني.'
} else {
  // items is sent as the raw string — the server parses it. text always rides
  // along so the original wording is kept as the audit trail.
  const payload: any = { text, sender, chat_id: chatId, message_id: messageId }
  if (itemsJson) payload.items = itemsJson

  try {
    const res = await axios.post(
      'https://YOUR-APP.up.railway.app/api/management/ingest',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-engosoft-secret': 'YOUR_MANAGEMENT_WEBHOOK_SECRET'
        },
        timeout: 30000
      }
    )
    w.dashboardReply = res.data?.reply || 'اتسجّل.'
    console.log('ingest ok:', res.status, JSON.stringify(res.data).slice(0, 300))
  } catch (err: any) {
    console.log('ingest failed:', err?.response?.status, JSON.stringify(err?.response?.data || err?.message))
    w.dashboardReply = 'حصلت مشكلة أثناء التسجيل. ابعت الرسالة تاني بعد شوية.'
  }
}

w.pendingText = ''
w.itemsJson = ''
```

**Card 2 — Text Message:** `{{workflow.dashboardReply}}`

The API's `reply` is already written for a human and already names what was
saved, so printing it beats asking the LLM to re-say it — the numbers can't
drift between what was stored and what the user is told. The same field
carries the "not activated yet" prompt, so activation needs no extra branch.

**Card 3 — Transition** back to the Autonomous Node.

Replace both placeholders: the URL with your deployment, and the secret with
`MANAGEMENT_WEBHOOK_SECRET`.

---

## 5. `getAgenda` (Standard Node)

**Card 1 — Execute Code**, named `getAgenda`:

```typescript
const w = workflow as any

try {
  const res = await axios.get(
    'https://YOUR-APP.up.railway.app/api/management/agenda?day_offset=0',
    {
      headers: { 'x-engosoft-secret': 'YOUR_MANAGEMENT_WEBHOOK_SECRET' },
      timeout: 30000
    }
  )
  w.dashboardReply = res.data?.text || 'مفيش مواعيد النهاردة.'
} catch (err: any) {
  console.log('agenda failed:', err?.response?.status, err?.message)
  w.dashboardReply = 'مقدرتش أجيب الأجندة دلوقتي. جرّب تاني.'
}
```

`day_offset=1` for tomorrow.

**Card 2 — Text Message:** `{{workflow.dashboardReply}}` · **Card 3 —
Transition** back to the Autonomous Node.

---

## 6. Who is allowed to file

A Telegram bot is reachable by anyone who finds its @username, and Botpress
forwards every one of those messages. Set `MANAGEMENT_JOIN_CODE` on the server
and the first message from a new chat has to be that code:

```
manager ──► "اجتماع بكرة ٢"    ──► "الشات ده لسه مش مفعّل. ابعت كود الانضمام…"
manager ──► "8412"             ──► "تمام، الشات ده اتفعّل…"      (row in mgmt_member)
manager ──► "اجتماع بكرة ٢"    ──► "اتسجّل بند واحد: …"
```

The server records the chat id it already saw on the request — the manager
never sees an id and never configures one. Unenrolled messages write nothing
at all, not even a log row, so a stranger can't fill the inbox.

Revoke by deleting the row:

```sql
select * from public.mgmt_member;
delete from public.mgmt_member where chat_id = '123456789';
```

Leave `MANAGEMENT_JOIN_CODE` unset and there's no chat-level gate — fine while
testing, not for a bot whose @username is known.

---

## 7. Simpler variant

Transitions exist so you can watch each step in the Inspector. To keep it in
one place instead, attach the Execute Code card **directly to the Autonomous
Node** — it becomes a tool the LLM calls by name — and drop both Standard
Nodes. Keep the name `sendToDashboard`, and add to the prompt: *"After calling
sendToDashboard, show the returned reply to the user verbatim."*

---

## 8. Checklist

- [ ] Telegram integration installed in Botpress and connected to the bot token
- [ ] `itemsJson`, `pendingText` and `dashboardReply` exist as **String**, Allow Write Access ON
- [ ] Autonomous Node: **Allow Conversation ON**
- [ ] Execute Code cards renamed (`sendToDashboard`, `getAgenda`)
- [ ] URL and `x-engosoft-secret` filled in on both cards
- [ ] Standard Nodes end with a transition back to the Autonomous Node
- [ ] Published — Botpress serves the previous version until you click Publish

**Test messages**

| Message | Expected |
| --- | --- |
| anything, from a brand-new chat | "الشات ده لسه مش مفعّل…" (when a join code is set) |
| the join code | "تمام، الشات ده اتفعّل…" |
| `عايز اجتماع مع فريق المبيعات بكرة ٢ الضهر لمدة ساعة` | one meeting, tomorrow 14:00 Cairo, 60 min |
| `أحمد يجهّز تقرير التذاكر المتأخرة قبل الخميس، ومنى تتابع عرض شركة النيل` | two tasks with owners |
| `موعد مع عميل السويس` | saved, flagged **محتاج مراجعة** (no time) |
| `إيه أجندة النهاردة؟` | today's list, nothing new stored |
| `صباح الخير` | short reply, nothing stored |

If a message stores nothing, open the tab's **الوارد من تليجرام** card — the
raw text is there with the failure reason printed underneath it. The Inspector
also logs `ingest ok:` with the API's full response, so you can see exactly how
many items the server accepted from what the node sent.

**No `ANTHROPIC_API_KEY` is needed for this path.** The server only calls a
model when a message arrives with no `items` — which is what the direct
Telegram route does. Leave the key unset and Botpress-filed items still work;
a message that somehow arrives without items is stored raw and flagged for
review instead.
