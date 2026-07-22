# Botpress Cloud bot — «دفتر الإدارة»

The Telegram front-end for the management tab. Botpress Cloud owns the
conversation (its own Telegram integration, its own reply); this project's
`/api/management/ingest` owns the extraction and the writing.

```
Telegram ──► Botpress Cloud ──► Autonomous Node «Management Desk»
                                   │  copies the message into {{workflow.pendingText}}
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

> **Free plan:** `axios` from an Execute Code card is blocked on Botpress's
> free tier — the card fails with `axios is not defined`. Filing needs a paid
> plan, or n8n as the relay (same endpoint, same body).

---

## 1. Workflow variables

Create both on the workflow (**type `String`**, Allow Write Access **ON**):

| Variable | Written by | Holds |
| --- | --- | --- |
| `pendingText` | the LLM | the message to file, in the user's own words |
| `dashboardReply` | Execute Code | what the API replied — printed verbatim |

Only `pendingText` is LLM-written, and it's plain text, not JSON. That's
deliberate: the Autonomous Node is unreliable at filling structured variables,
and the extraction already happens server-side where the output is
schema-validated before anything is written.

---

## 2. Autonomous Node — system prompt

**Settings:** Allow Conversation **ON**.

```
<role>
You are "دفتر الإدارة" (the Management Desk), a Telegram assistant for the management team at Engosoft. You collect what needs to happen today from managers, hand it to the management dashboard, and answer questions about the agenda. You never do the work yourself and you never give advice.
</role>

<language>
Always reply in simple Egyptian Arabic. One or two sentences. No preamble, no pleasantries, no emoji. Put English technical terms in parentheses instead of mixing them into an Arabic sentence.
</language>

<critical_rules>
- NEVER use clock.setReminder or any built-in reminder tool. The only thing that stores anything is the sendToDashboard transition.
- NEVER invent a date, a name, or a detail. Only what the user actually wrote gets sent.
- NEVER summarise, translate, or rewrite the user's message before sending it. Copy their exact wording into {{workflow.pendingText}}.
- Every message that carries buttons must also carry non-empty text.
- After the dashboard reply has been shown to the user, stop and wait for a new message. Do not repeat it, expand on it, or add a follow-up question.
</critical_rules>

<tasks>
FILING
When the message contains a task, a meeting, an appointment, a reminder, or a decision:
1. Store the user's full message text in {{workflow.pendingText}}.
2. Transition to sendToDashboard immediately. Send no message before transitioning.

ACTIVATION
If the dashboard's last reply said this chat is not activated ("الشات ده لسه مش مفعّل"), then the user's next message is their join code. Store it in {{workflow.pendingText}} exactly as typed and transition to sendToDashboard — even if it is only a number or a single word.

MISSING OWNER OR TIME
If it is clearly an action item but the owner or the time is missing, ask ONE short question about the missing piece only. If the user says it is not decided yet, or ignores the question, file it as-is — the dashboard flags it for review.

AGENDA
When the user asks about today's or tomorrow's schedule, what is due, what is late, or "إيه المطلوب مني", transition to getAgenda.

SMALL TALK
Greetings, thanks, or questions about what you can do: one short sentence saying you file tasks, meetings and appointments and can show the agenda. No transition.
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

**Why it's short:** this node only routes. The heavy prompt — kinds,
priorities, absolute timestamps, confidence, review flags — is the extraction
prompt, and it runs server-side against a JSON schema.

---

## 3. Transitions

Two transition cards on the Autonomous Node. The text is what the LLM reads to
decide, so each names the trigger *and* the precondition.

**→ `sendToDashboard`**

```
Go here when the user's message contains a task, meeting, appointment, reminder, or decision that must be filed — or when it is the join code the dashboard just asked for — and you have already copied their full message text into {{workflow.pendingText}}. Transition immediately, without sending any message first.
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

// Telegram identifiers. Botpress preprocesses the update, so these live on
// event.tags — not on event.payload.from. Nothing here is configured by hand.
const chatId = String(
  e?.tags?.conversation?.['telegram:id'] ||
  e?.tags?.user?.['telegram:id'] ||
  e?.conversationId ||
  ''
)
const messageId = String(e?.tags?.message?.['telegram:id'] || e?.id || '')
const sender = String(u?.name || u?.data?.fullName || '')

if (!text) {
  w.dashboardReply = 'مفيش نص أقدر أسجّله. ابعت اللي مطلوب تاني.'
} else {
  try {
    const res = await axios.post(
      'https://YOUR-APP.up.railway.app/api/management/ingest',
      { text, sender, chat_id: chatId, message_id: messageId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-engosoft-secret': 'YOUR_MANAGEMENT_WEBHOOK_SECRET'
        },
        timeout: 30000
      }
    )
    w.dashboardReply = res.data?.reply || 'اتسجّل.'
  } catch (err: any) {
    console.log('ingest failed:', err?.response?.status, err?.message)
    w.dashboardReply = 'حصلت مشكلة أثناء التسجيل. ابعت الرسالة تاني بعد شوية.'
  }
}

w.pendingText = ''
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
- [ ] `pendingText` and `dashboardReply` exist with Allow Write Access ON
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
raw text is there with the failure reason.
