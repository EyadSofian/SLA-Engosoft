import { useMemo, useState } from 'react';
import { select } from '../lib/supabase';
import type { DeptSummary } from '../types/db';
import { deptHealth } from '../lib/metrics';
import { NOUN, arCount, fmtInt } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useRefresh } from '../hooks/useRefresh';
import { useErrorToast } from '../hooks/useErrorToast';
import { Card, EmptyState, ErrorState, SkeletonCard, cx } from '../components/ui/primitives';
import { DeptCard } from '../components/DeptCard';
import { IconSearch } from '../components/Icons';

type SortKey = 'open' | 'sla' | 'backlog' | 'name';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'open', label: 'الأكتر مفتوح' },
  { key: 'sla', label: 'الأسوأ في SLA' },
  { key: 'backlog', label: 'الأكتر تأخيرًا' },
  { key: 'name', label: 'أبجدي' },
];

export default function Departments() {
  const { tick } = useRefresh();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('open');

  const depts = useAsync(() => select<DeptSummary>('dept_summary'), [tick]);
  useErrorToast(depts.error);

  const rows = useMemo(() => {
    const list = (depts.data ?? []).filter((d) =>
      d.team_name?.toLowerCase().includes(query.trim().toLowerCase()),
    );

    const sorted = [...list];
    switch (sort) {
      case 'open':
        sorted.sort((a, b) => b.open_cnt - a.open_cnt);
        break;
      case 'sla':
        // Departments with no SLA data sort last rather than pretending to be 0%.
        sorted.sort((a, b) => (a.sla_met_pct ?? 999) - (b.sla_met_pct ?? 999));
        break;
      case 'backlog':
        sorted.sort((a, b) => b.backlog_7p - a.backlog_7p || b.backlog_3_7 - a.backlog_3_7);
        break;
      case 'name':
        sorted.sort((a, b) => a.team_name.localeCompare(b.team_name, 'ar'));
        break;
    }
    return sorted;
  }, [depts.data, query, sort]);

  const critical = rows.filter((d) => deptHealth(d) === 'bad').length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-navy">الأقسام</h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          {depts.data
            ? `${arCount(depts.data.length, NOUN.dept)}${critical > 0 ? ` · ${fmtInt(critical)} محتاج تدخّل` : ''}`
            : 'بيحمّل…'}
        </p>
      </div>

      {/* One filter row above everything it scopes. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">دوّر على قسم</span>
          <IconSearch className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="دوّر على قسم…"
            className="min-h-[44px] w-full rounded-xl border border-surface-line bg-white ps-9 pe-3 text-sm text-navy placeholder:text-ink-faint focus:border-brand-300"
          />
        </label>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={cx(
                'tap min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold transition',
                sort === s.key
                  ? 'bg-navy text-white'
                  : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {depts.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : depts.error ? (
        <Card>
          <ErrorState error={depts.error} onRetry={depts.reload} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={query ? 'مفيش قسم بالاسم ده' : 'مفيش أقسام'}
            hint={query ? 'جرّب تكتب جزء من الاسم بس.' : undefined}
          />
        </Card>
      ) : (
        <div className={cx('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', depts.refreshing && 'is-refetching')}>
          {rows.map((d) => (
            <DeptCard key={d.team_name} dept={d} />
          ))}
        </div>
      )}
    </div>
  );
}
