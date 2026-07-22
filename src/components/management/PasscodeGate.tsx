import { useState } from 'react';
import { MgmtError, openSession, type SessionMeta } from '../../lib/management';
import { IconAlert, IconLock } from '../Icons';
import { cx } from '../ui/primitives';

/**
 * Temporary access gate for the management tab.
 *
 * The passcode is checked on the server — this component only exchanges it for
 * a signed token. Hiding the tab in the browser would be theatre: the data is
 * never in the bundle to begin with.
 */
export function PasscodeGate({ onUnlocked }: { onUnlocked: (meta: SessionMeta) => void }) {
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MgmtError | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!passcode.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      onUnlocked(await openSession(passcode));
    } catch (err) {
      setError(err instanceof MgmtError ? err : new MgmtError('حصلت مشكلة. جرّب تاني.', 0));
      setPasscode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid place-items-center px-2 py-10 sm:py-16">
      <div className="card w-full max-w-sm p-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-navy text-white">
          <IconLock className="h-7 w-7" />
        </span>

        <h1 className="mt-4 text-lg font-extrabold text-navy">لوحة الإدارة</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          التبويب ده محمي برقم سري مؤقّت. الجلسة بتفضل مفتوحة على الجهاز ده لحد ما تقفل التبويب.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-start">
            <span className="sr-only">الرقم السري</span>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="الرقم السري"
              maxLength={128}
              className="min-h-[48px] w-full rounded-xl border border-surface-line bg-white px-3 text-center text-base tracking-[0.3em] text-navy placeholder:tracking-normal placeholder:text-ink-faint focus:border-brand-300"
            />
          </label>

          <button
            type="submit"
            disabled={busy || !passcode.trim()}
            className={cx(
              'tap flex min-h-[48px] w-full items-center justify-center rounded-xl bg-navy text-sm font-bold text-white transition',
              'hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45',
            )}
          >
            {busy ? 'بيتأكّد…' : 'دخول'}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl bg-status-badBg p-3 text-start text-xs leading-relaxed text-status-bad"
          >
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{error.message}</p>
              {error.hint && <p className="mt-1 text-ink-muted">{error.hint}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
