import { useEffect, useRef, useState } from 'react';
import { select } from '../../lib/supabase';
import type { DeptSummary, SalesSummary } from '../../types/db';
import { monthKey } from '../../lib/format';
import { rollUp } from '../../lib/metrics';
import { cx } from '../ui/primitives';
import { IconChat, IconClose, IconSend } from '../Icons';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTIONS = [
  'أعلى قسم backlog؟',
  'مين أحسن سيلز الشهر ده؟',
  'ليه الـ SLA وقع؟',
  'إيه الأقسام المحتاجة تدخّل؟',
];

/** Round floats so the model isn't fed 12 decimal places of noise. */
const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

/**
 * Fetches only what a question could plausibly need, trimmed to the columns
 * that matter. The model ranks and explains these numbers — it never invents
 * them, and it never gets a database connection of its own.
 */
async function buildContext() {
  const month = monthKey();

  const [depts, sales] = await Promise.all([
    select<DeptSummary>('dept_summary'),
    select<SalesSummary>('sales_summary', { filter: { month: `eq.${month}` }, limit: 200 }),
  ]);

  const totals = rollUp(depts);

  return {
    generated_at: new Date().toISOString(),
    current_month: month,
    company_totals: {
      open: totals.open,
      closed: totals.closed,
      unassigned: totals.unassigned,
      urgent: totals.urgent,
      sla_failed: totals.failed,
      sla_met_pct: r1(totals.slaMetPct),
    },
    departments: depts.map((d) => ({
      team: d.team_name,
      open: d.open_cnt,
      closed: d.closed_cnt,
      unassigned: d.unassigned_cnt,
      urgent: d.urgent_cnt,
      sla_failed: d.failed_cnt,
      sla_met_pct: r1(d.sla_met_pct),
      avg_resolution_hours: r1(d.avg_resolution_hours),
      avg_csat: r1(d.avg_csat),
      backlog: { d1_3: d.backlog_1_3, d3_7: d.backlog_3_7, d7_plus: d.backlog_7p },
    })),
    sales_this_month: sales.map((s) => ({
      person: s.user_name,
      team: s.team_name,
      achieved: Math.round(s.achieved_total ?? 0),
      deals: s.deals_count,
      quotations: s.quotations_count,
      pipeline: Math.round(s.pipeline_value ?? 0),
      team_target: s.team_target,
    })),
  };
}

export function ChatFab() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setInput('');
    setBusy(true);
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: 'user', text: q }]);

    try {
      const context = await buildContext();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, context, history }),
      });

      const data = await res.json().catch(() => ({}));
      const text = res.ok
        ? (data.answer ?? 'مفيش رد.')
        : (data.error ?? 'حصلت مشكلة. جرّب تاني.');
      setMessages((m) => [...m, { role: 'assistant', text }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'تعذّر الاتصال بالمساعد. اطمّن على النت وجرّب تاني.' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* FAB — bottom-left in RTL, lifted clear of the mobile bottom nav. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="افتح المساعد الذكي"
          className="tap fixed bottom-24 end-4 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy text-white shadow-panel transition hover:bg-brand-700 lg:bottom-6 lg:end-6"
        >
          <IconChat className="h-6 w-6" />
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-navy/25 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-0"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="المساعد الذكي"
            className="glass fixed inset-0 z-50 flex animate-panel-in flex-col rounded-none sm:inset-auto sm:bottom-6 sm:end-6 sm:h-[560px] sm:w-[400px] sm:rounded-3xl"
          >
            <header className="flex items-center justify-between gap-2 border-b border-white/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-navy">اسأل عن الأرقام</p>
                <p className="truncate text-[11px] text-ink-muted">بيقرا من البيانات الحيّة</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق المساعد"
                className="tap grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-white/60 hover:text-navy"
              >
                <IconClose className="h-5 w-5" />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-ink-muted">
                    اسأل بالعربي عن أي رقم في اللوحة. المساعد بيشرح ويقارن الأرقام الموجودة بس — مش
                    بيخترع حاجة.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="tap rounded-xl border border-surface-line bg-white/80 px-3 py-2 text-xs font-medium text-navy transition hover:border-brand-300 hover:text-brand-600"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cx('flex', m.role === 'user' ? 'justify-start' : 'justify-end')}
                >
                  <p
                    className={cx(
                      'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'bg-brand-500 text-white'
                        : 'bg-white text-ink shadow-card',
                    )}
                  >
                    {m.text}
                  </p>
                </div>
              ))}

              {busy && (
                <div className="flex justify-end">
                  <p className="flex items-center gap-1.5 rounded-2xl bg-white px-3.5 py-3 shadow-card">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </p>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-white/40 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <label className="sr-only" htmlFor="chat-input">
                اكتب سؤالك
              </label>
              <input
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب سؤالك…"
                maxLength={500}
                className="min-h-[44px] flex-1 rounded-xl border border-surface-line bg-white px-3 text-sm text-navy placeholder:text-ink-faint focus:border-brand-300"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="إرسال"
                className="tap grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconSend className="h-5 w-5" />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
