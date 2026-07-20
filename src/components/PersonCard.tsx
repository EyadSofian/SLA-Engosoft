import { fmtInt, fmtMoney, fmtMoneyCompact, fmtPct } from '../lib/format';
import { Meter } from './ui/Stat';
import { cx } from './ui/primitives';

export interface PersonRow {
  rank: number;
  name: string;
  team?: string | null;
  achieved: number;
  deals?: number | null;
  quotations?: number | null;
  pipeline?: number | null;
  target?: number | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] leading-none text-ink-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold leading-none text-navy">{value}</p>
    </div>
  );
}

/**
 * One salesperson as a card rather than a table row.
 *
 * `dir="auto"` on the name matters: most of these names are Latin script
 * sitting inside an RTL page, and without it the browser drags punctuation
 * and initials to the wrong end.
 */
export function PersonCard({ person }: { person: PersonRow }) {
  const { rank, name, team, achieved, deals, quotations, pipeline, target } = person;
  const pct = target && target > 0 ? (achieved / target) * 100 : null;
  const isTop = rank <= 3;

  const badge =
    rank === 1
      ? 'bg-accent-500 text-white'
      : isTop
        ? 'bg-brand-500 text-white'
        : 'bg-slate-100 text-ink-muted';

  return (
    <article
      className={cx(
        // min-w-0 is load-bearing: a grid item's automatic minimum size is its
        // min-content width, so without it the card refuses to shrink below the
        // longest unbreakable name and pushes the whole page into h-scroll.
        'card flex min-w-0 flex-col p-4 transition hover:shadow-lift',
        rank === 1 && 'ring-1 ring-accent-500/30',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold tabular-nums',
            badge,
          )}
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <p dir="auto" className="truncate text-sm font-bold leading-snug text-navy" title={name}>
            {name}
          </p>
          {team && (
            <p dir="auto" className="mt-0.5 truncate text-[11px] text-ink-muted" title={team}>
              {team}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-2xl font-extrabold leading-none text-navy">{fmtMoneyCompact(achieved)}</p>
        <p className="mt-1 text-[11px] text-ink-muted">{fmtMoney(achieved)}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-surface-line pt-3">
        <Stat label="صفقات" value={fmtInt(deals)} />
        <Stat label="عروض" value={fmtInt(quotations)} />
        <Stat label="Pipeline" value={fmtMoneyCompact(pipeline)} />
      </div>

      {pct != null && (
        <div className="mt-3 border-t border-surface-line pt-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-ink-muted">من تارجت الفريق</span>
            <span
              className={cx(
                'text-xs font-bold',
                pct >= 100 ? 'text-status-ok' : pct >= 70 ? 'text-[#B45309]' : 'text-status-bad',
              )}
            >
              {fmtPct(pct, 0)}
            </span>
          </div>
          <Meter
            value={achieved}
            max={target!}
            tone={pct >= 100 ? 'ok' : pct >= 70 ? 'warn' : 'bad'}
          />
        </div>
      )}
    </article>
  );
}
