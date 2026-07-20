#!/usr/bin/env node
/**
 * Engosoft daily digest → Telegram.
 *
 * Run once every morning (08:00 Africa/Cairo). Works as a Railway cron
 * service, a GitHub Action, or plain `node scripts/telegram-digest.js`.
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * Flags:
 *   --dry-run   print the message instead of sending it
 *   --weekly    force the longer Sunday roll-up
 */

const TZ = 'Africa/Cairo';
const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

const SLA_BAD = 80;
const AT_RISK_HOURS = 24;
const TELEGRAM_MAX = 4096;

// ── time helpers (Cairo wall clock, not the host's timezone) ──────────────

function tzOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  const asUTC = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second,
  );
  return asUTC - date.getTime();
}

/** Instant corresponding to 00:00 today in Cairo. */
function startOfCairoDay(now = new Date()) {
  const offset = tzOffsetMs(now, TZ);
  const shifted = new Date(now.getTime() + offset);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - offset);
}

function cairoParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m] = fmt.format(now).split('-');
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now);
  const label = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  return { monthStart: `${y}-${m}-01`, weekday, label };
}

// ── formatting ───────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 0 });
const n = (v) => nf.format(Math.round(Number(v) || 0));
const pct = (v) => (v == null ? '—' : `${Math.round(Number(v))}%`);

/** Keep in step with the dashboard's VITE_CURRENCY. */
const MARKS = { EGP: 'ج.م', USD: '$', EUR: '€', GBP: '£', SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك' };
const CURRENCY_CODE = (process.env.CURRENCY ?? 'USD').toUpperCase();
const MARK = MARKS[CURRENCY_CODE] ?? CURRENCY_CODE;
const money = (v) =>
  ['USD', 'EUR', 'GBP'].includes(CURRENCY_CODE) ? `${MARK}${n(v)}` : `${n(v)} ${MARK}`;

/** Telegram HTML parse_mode only needs these three escaped. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// ── Supabase REST ────────────────────────────────────────────────────────

async function rest(path, { count = false } = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: 'application/json',
  };
  if (count) headers.Prefer = 'count=exact';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  }
  if (count) {
    const total = res.headers.get('content-range')?.split('/')[1];
    if (total && total !== '*') return Number(total);
    return (await res.json()).length;
  }
  return res.json();
}

const countRows = (source, query) => rest(`${source}?select=count&limit=1&${query}`, { count: true });

// ── message ──────────────────────────────────────────────────────────────

async function build() {
  const now = new Date();
  const { monthStart, weekday, label } = cairoParts(now);
  const todayISO = startOfCairoDay(now).toISOString();
  const atRiskISO = new Date(now.getTime() + AT_RISK_HOURS * 3600_000).toISOString();
  const weekly = process.argv.includes('--weekly') || weekday === 'Sun';

  const [depts, openedToday, closedToday, sales, atRisk, staleUnassigned] = await Promise.all([
    rest('dept_summary?select=*'),
    countRows('fact_ticket', `create_date=gte.${todayISO}`),
    countRows('fact_ticket', `close_date=gte.${todayISO}`),
    rest(`sales_summary?select=*&month=eq.${monthStart}&order=achieved_total.desc&limit=200`),
    countRows('fact_sla', `status=eq.ongoing&deadline=lte.${atRiskISO}&deadline=gte.${now.toISOString()}`),
    countRows('fact_ticket', 'is_unassigned=eq.true&is_open=eq.true&aging_days=gt.1'),
  ]);

  const lines = [`📊 <b>تقرير Engosoft اليومي</b> — ${esc(label)}`, ''];

  // Tickets per department
  lines.push('🎫 <b>التذاكر المفتوحة:</b>');
  const byOpen = [...depts].sort((a, b) => (b.open_cnt ?? 0) - (a.open_cnt ?? 0));
  if (byOpen.length === 0) {
    lines.push('• مفيش بيانات أقسام.');
  } else {
    for (const d of byOpen) {
      const bits = [`${n(d.open_cnt)} مفتوح`];
      if (d.unassigned_cnt > 0) bits.push(`${n(d.unassigned_cnt)} غير مُسند`);
      if (d.urgent_cnt > 0) bits.push(`${n(d.urgent_cnt)} عاجل`);
      if (d.failed_cnt > 0) bits.push(`${n(d.failed_cnt)} SLA متأخر`);
      lines.push(`• <b>${esc(d.team_name)}</b>: ${bits.join(' · ')}`);
    }
  }

  lines.push('', `🟢 <b>النهاردة:</b> اتفتح ${n(openedToday)} · اتقفل ${n(closedToday)}`);

  // Attention list
  const critical = depts.filter((d) => (d.sla_met_pct != null && d.sla_met_pct < SLA_BAD) || d.backlog_7p >= 10);
  if (critical.length > 0) {
    const names = critical.map((d) => `${esc(d.team_name)} (SLA ${pct(d.sla_met_pct)})`).join('، ');
    lines.push(`🔴 <b>محتاج انتباه:</b> ${names}`);
  } else {
    lines.push('🔴 <b>محتاج انتباه:</b> مفيش — كل الأقسام في المستوى.');
  }

  if (atRisk > 0) lines.push(`⏳ <b>قرب يتأخر:</b> ${n(atRisk)} تذكرة الـ SLA بتاعها بيخلص خلال ٢٤ ساعة.`);
  if (staleUnassigned > 0) lines.push(`📭 <b>غير مُسندة من أكتر من يوم:</b> ${n(staleUnassigned)} تذكرة.`);

  // Sales
  lines.push('', '💰 <b>السيلز (الشهر لحد دلوقتي) — أعلى 5:</b>');
  const top = sales.slice(0, 5);
  if (top.length === 0) {
    lines.push('• مفيش مبيعات متسجّلة الشهر ده.');
  } else {
    top.forEach((p, i) => {
      lines.push(
        `${i + 1}. ${esc(p.user_name ?? '—')} — ${money(p.achieved_total)} (${n(p.deals_count)} صفقة)`,
      );
    });
    const total = sales.reduce((s, p) => s + (Number(p.achieved_total) || 0), 0);
    lines.push(`<i>الإجمالي: ${money(total)} من ${n(sales.length)} فرد</i>`);
  }

  // Best / worst
  const rated = depts.filter((d) => d.sla_met_pct != null);
  if (rated.length > 0) {
    const best = rated.reduce((a, b) => (b.sla_met_pct > a.sla_met_pct ? b : a));
    const worst = rated.reduce((a, b) => (b.sla_met_pct < a.sla_met_pct ? b : a));
    lines.push(
      '',
      `⭐ <b>أحسن قسم:</b> ${esc(best.team_name)} (${pct(best.sla_met_pct)})`,
      `⚠️ <b>أكتر قسم متأخر:</b> ${esc(worst.team_name)} (${pct(worst.sla_met_pct)})`,
    );
  }

  // Sunday roll-up
  if (weekly) {
    lines.push('', '📅 <b>ملخّص الأسبوع:</b>');
    for (const d of byOpen) {
      lines.push(
        `• <b>${esc(d.team_name)}</b>: SLA ${pct(d.sla_met_pct)} · متوسط الحل ${
          d.avg_resolution_hours == null ? '—' : `${Math.round(d.avg_resolution_hours)} ساعة`
        } · تقييم ${d.avg_csat == null ? '—' : Number(d.avg_csat).toFixed(1)}`,
      );
    }
  }

  let text = lines.join('\n');
  if (text.length > TELEGRAM_MAX) text = `${text.slice(0, TELEGRAM_MAX - 20)}\n…(اتقصّ)`;
  return text;
}

async function sendTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ok === false) {
    throw new Error(`Telegram ${res.status}: ${body.description ?? 'unknown error'}`);
  }
}

async function main() {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'].filter((k) => !process.env[k]);
  if (!DRY_RUN) missing.push(...['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'].filter((k) => !process.env[k]));
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')}`);
    process.exit(1);
  }

  const text = await build();

  if (DRY_RUN) {
    console.log(text);
    return;
  }
  await sendTelegram(text);
  console.log('Digest sent.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
