import type { ReactNode } from 'react';
import { STATUS } from '../../lib/theme';
import { HEALTH_LABEL, type Health } from '../../lib/metrics';
import { fmtPct } from '../../lib/format';
import { cx } from './primitives';

/**
 * Stat tile: label · value · optional hint.
 * The value keeps proportional figures — `tabular-nums` makes a number like
 * 121 look loose at display sizes.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand';
  className?: string;
}) {
  const tones = {
    neutral: 'text-navy',
    ok: 'text-status-ok',
    warn: 'text-[#B45309]',
    bad: 'text-status-bad',
    brand: 'text-brand-600',
  } as const;

  const iconTones = {
    neutral: 'bg-slate-100 text-ink-muted',
    ok: 'bg-status-okBg text-status-ok',
    warn: 'bg-status-warnBg text-[#B45309]',
    bad: 'bg-status-badBg text-status-bad',
    brand: 'bg-brand-50 text-brand-600',
  } as const;

  return (
    <div className={cx('card p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        {icon && (
          <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', iconTones[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className={cx('mt-2 text-2xl font-bold leading-tight sm:text-[28px]', tones[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * Percentage ring. The figure is always printed inside, so the value is never
 * carried by colour alone.
 */
export function Ring({
  value,
  size = 76,
  stroke = 8,
  label,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;

  const color = value == null ? '#CBD5E1' : pct < 80 ? STATUS.bad : pct < 95 ? STATUS.warn : STATUS.ok;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label ?? 'نسبة'} ${fmtPct(value)}`}>
          {/* Track is a lighter step of the same scale, so state reads across the whole ring. */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF2F7" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-sm font-bold text-navy">
          {value == null ? '—' : `${Math.round(pct)}%`}
        </span>
      </div>
      {label && <span className="text-[11px] font-medium text-ink-muted">{label}</span>}
    </div>
  );
}

/** Traffic light. Always ships with its word — colour is never the only signal. */
export function StatusPill({ health, reason }: { health: Health; reason?: string | null }) {
  const dot = { ok: 'bg-status-ok', warn: 'bg-status-warn', bad: 'bg-status-bad' }[health];
  const text = { ok: 'text-status-ok', warn: 'text-[#B45309]', bad: 'text-status-bad' }[health];
  const bg = { ok: 'bg-status-okBg', warn: 'bg-status-warnBg', bad: 'bg-status-badBg' }[health];

  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold', bg, text)}
      title={reason ?? undefined}
    >
      <span className={cx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
      {HEALTH_LABEL[health]}
    </span>
  );
}

/** Horizontal meter — fill carries severity, track is a lighter step. */
export function Meter({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | Health }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = {
    brand: 'bg-brand-500',
    ok: 'bg-status-ok',
    warn: 'bg-status-warn',
    bad: 'bg-status-bad',
  }[tone];
  const track = {
    brand: 'bg-brand-100',
    ok: 'bg-status-okBg',
    warn: 'bg-status-warnBg',
    bad: 'bg-status-badBg',
  }[tone];

  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full', track)}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
