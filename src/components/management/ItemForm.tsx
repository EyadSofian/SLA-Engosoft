import { useEffect, useState, type ReactNode } from 'react';
import type { MgmtDraft, MgmtPriority, MgmtStatus } from '../../types/management';
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER } from '../../lib/management';
import { KindCards } from './KindCards';
import { cx } from '../ui/primitives';
import { IconClose } from '../Icons';

const field =
  'min-h-[44px] w-full rounded-xl border border-surface-line bg-white px-3 text-sm text-navy placeholder:text-ink-faint focus:border-brand-300';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={cx(
            'tap min-h-[44px] flex-1 shrink-0 rounded-xl px-3 text-xs font-semibold transition',
            value === option
              ? 'bg-navy text-white'
              : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  );
}

/**
 * Create / edit sheet. Full-screen on phones (managers reach for this on the
 * way into a meeting), centred dialog from `sm` up.
 */
export function ItemForm({
  initial,
  heading,
  team,
  departments,
  onSubmit,
  onClose,
  showStatus = false,
}: {
  initial: MgmtDraft;
  heading: string;
  team: string[];
  departments: string[];
  onSubmit: (draft: MgmtDraft) => Promise<void>;
  onClose: () => void;
  showStatus?: boolean;
}) {
  const [draft, setDraft] = useState<MgmtDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof MgmtDraft>(key: K, value: MgmtDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const timed = draft.kind === 'meeting' || draft.kind === 'appointment';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حصلت مشكلة أثناء الحفظ.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-navy/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      {/* Flex centring rather than translate math — `start-1/2` with
          `-translate-x-1/2` silently mis-centres under RTL. */}
      <div className="pointer-events-none fixed inset-0 z-50 flex sm:items-center sm:justify-center sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={heading}
          className="pointer-events-auto flex w-full animate-panel-in flex-col bg-surface-bg sm:max-h-[88vh] sm:w-[560px] sm:rounded-3xl sm:shadow-panel"
        >
          <header className="flex items-center justify-between gap-2 border-b border-surface-line px-4 py-3">
            <h2 className="text-sm font-bold text-navy">{heading}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="tap grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-white hover:text-navy"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </header>

          <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Field label="النوع">
              <KindCards value={draft.kind} onSelect={(kind) => set('kind', kind)} compact />
            </Field>

            <Field label="العنوان">
              <input
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                autoFocus
                maxLength={200}
                placeholder="مثال: مراجعة تقرير التذاكر المتأخرة"
                className={field}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="المسؤول">
                <input
                  value={draft.owner_name}
                  onChange={(e) => set('owner_name', e.target.value)}
                  list="mgmt-team"
                  maxLength={120}
                  placeholder="اسم الشخص"
                  className={field}
                />
              </Field>

              <Field label="القسم">
                <input
                  value={draft.department}
                  onChange={(e) => set('department', e.target.value)}
                  list="mgmt-departments"
                  maxLength={120}
                  placeholder="اختياري"
                  className={field}
                />
              </Field>
            </div>

            <datalist id="mgmt-team">
              {team.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <datalist id="mgmt-departments">
              {departments.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الوقت" hint="سيبه فاضي لو لسه مش محدّد">
                <input
                  type="datetime-local"
                  value={draft.due_at}
                  onChange={(e) => set('due_at', e.target.value)}
                  dir="ltr"
                  className={cx(field, 'text-start')}
                />
              </Field>

              {timed && (
                <Field label="المدة بالدقايق">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    step={5}
                    value={draft.duration_min}
                    onChange={(e) => set('duration_min', e.target.value)}
                    dir="ltr"
                    placeholder="60"
                    className={cx(field, 'text-start')}
                  />
                </Field>
              )}
            </div>

            {timed && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="المكان">
                  <input
                    value={draft.location}
                    onChange={(e) => set('location', e.target.value)}
                    maxLength={200}
                    placeholder="المكتب، أونلاين، عند العميل…"
                    className={field}
                  />
                </Field>

                <Field label="الحاضرين" hint="افصل بينهم بفاصلة">
                  <input
                    value={draft.attendees}
                    onChange={(e) => set('attendees', e.target.value)}
                    placeholder="أحمد، منى"
                    className={field}
                  />
                </Field>
              </div>
            )}

            <Field label="الأولوية">
              <Segmented<MgmtPriority>
                value={draft.priority}
                options={PRIORITY_ORDER}
                labels={PRIORITY_LABEL}
                onChange={(priority) => set('priority', priority)}
              />
            </Field>

            {showStatus && (
              <Field label="الحالة">
                <Segmented<MgmtStatus>
                  value={draft.status}
                  options={STATUS_ORDER}
                  labels={STATUS_LABEL}
                  onChange={(status) => set('status', status)}
                />
              </Field>
            )}

            <Field label="تفاصيل">
              <textarea
                value={draft.details}
                onChange={(e) => set('details', e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="أي تفاصيل زيادة…"
                className={cx(field, 'min-h-[88px] resize-y py-2 leading-relaxed')}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-xl bg-status-badBg p-3 text-xs font-semibold text-status-bad">
                {error}
              </p>
            )}
          </form>

          <footer className="flex items-center gap-2 border-t border-surface-line bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              className="tap min-h-[44px] flex-1 rounded-xl border border-surface-line bg-white text-sm font-semibold text-ink-muted transition hover:text-navy"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !draft.title.trim()}
              className="tap min-h-[44px] flex-[2] rounded-xl bg-navy text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? 'بيتحفظ…' : 'حفظ'}
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}
