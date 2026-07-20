import type { ReactNode } from 'react';
import { IconAlert, IconEmpty, IconRefresh } from '../Icons';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={cx('card p-4 sm:p-5', className)}>{children}</Tag>;
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold text-navy sm:text-lg">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand';
}) {
  const tones = {
    neutral: 'bg-slate-100 text-ink-muted',
    ok: 'bg-status-okBg text-status-ok',
    warn: 'bg-status-warnBg text-[#B45309]',
    bad: 'bg-status-badBg text-status-bad',
    brand: 'bg-brand-50 text-brand-700',
  } as const;

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Wide tables scroll inside their own card — they never widen the page. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0" role="region" tabIndex={0} aria-label="جدول قابل للتمرير">
      <div className="min-w-[640px] px-4 sm:min-w-0 sm:px-0">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-4 sm:p-5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title = 'لسه مفيش بيانات',
  hint,
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <IconEmpty className="h-8 w-8 text-ink-faint" />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const hint = (error as Error & { hint?: string }).hint;

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
    >
      <IconAlert className="h-8 w-8 text-status-bad" />
      <p className="text-sm font-semibold text-ink">{error.message}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-ink-muted">{hint}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="tap mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
        >
          <IconRefresh className="h-4 w-4" />
          جرّب تاني
        </button>
      )}
    </div>
  );
}
