import { useState, type ReactNode } from 'react';
import { cx } from '../ui/primitives';

/**
 * Wraps every chart with its accessible twin.
 *
 * A tooltip may enhance a value but must never be the only way to read it, so
 * each chart ships a table view behind a toggle.
 */
export function ChartFrame({
  title,
  subtitle,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  table: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);

  return (
    <section className={cx('card p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-navy sm:text-base">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="tap shrink-0 rounded-lg border border-surface-line px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted transition hover:border-brand-200 hover:text-brand-600"
        >
          {asTable ? 'عرض كرسم' : 'عرض كجدول'}
        </button>
      </div>

      {asTable ? <div className="overflow-x-auto">{table}</div> : children}
    </section>
  );
}

/** Shared table styling for the chart twins. */
export function MiniTable({
  head,
  rows,
}: {
  head: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-surface-line text-xs text-ink-muted">
          {head.map((h) => (
            <th key={h} scope="col" className="px-2 py-2 text-start font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-surface-line/70 last:border-0">
            {r.map((cell, j) => (
              <td key={j} className={cx('px-2 py-2', j === 0 ? 'font-medium text-navy' : 'text-ink-muted')}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
