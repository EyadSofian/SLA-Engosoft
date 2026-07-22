import { useMemo, useState } from 'react';
import { select } from '../lib/supabase';
import type { RecruitmentApplicant } from '../types/db';
import { fmtDate, fmtInt, fmtSince } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useRefresh } from '../hooks/useRefresh';
import { useErrorToast } from '../hooks/useErrorToast';
import { StatTile } from '../components/ui/Stat';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  SectionTitle,
  Skeleton,
  SkeletonCard,
  TableWrap,
  cx,
} from '../components/ui/primitives';
import { IconClock, IconRecruitment, IconSearch, IconUserOff } from '../components/Icons';

type StateFilter = 'all' | RecruitmentApplicant['operational_state'] | 'unassigned';

const STATE_FILTERS: Array<{ key: StateFilter; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'نشط' },
  { key: 'overdue', label: 'متابعة متأخرة' },
  { key: 'unassigned', label: 'بدون مسؤول' },
  { key: 'hired', label: 'تم التعيين' },
  { key: 'closed', label: 'مغلق' },
];

function statusBadge(row: RecruitmentApplicant) {
  if (row.operational_state === 'hired') return <Badge tone="ok">تم التعيين</Badge>;
  if (row.operational_state === 'overdue') return <Badge tone="bad">متابعة متأخرة</Badge>;
  if (row.operational_state === 'closed') return <Badge tone="neutral">مغلق</Badge>;
  return <Badge tone="brand">نشط</Badge>;
}

export default function Recruitment() {
  const { tick } = useRefresh();
  const [query, setQuery] = useState('');
  const [job, setJob] = useState('');
  const [state, setState] = useState<StateFilter>('all');

  const applicants = useAsync(
    () => select<RecruitmentApplicant>('recruitment_operational', {
      order: 'applied_at.desc',
      limit: 10000,
    }),
    [tick],
  );
  useErrorToast(applicants.error);

  const jobs = useMemo(
    () => [...new Set((applicants.data ?? []).map((r) => r.job_name).filter(Boolean))].sort() as string[],
    [applicants.data],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (applicants.data ?? []).filter((row) => {
      if (job && row.job_name !== job) return false;
      if (state === 'unassigned' && row.recruiter_user_id != null) return false;
      if (state !== 'all' && state !== 'unassigned' && row.operational_state !== state) return false;
      if (!q) return true;
      return [row.applicant_name, row.job_name, row.stage_name, row.recruiter_name, row.department_name]
        .some((value) => value?.toLowerCase().includes(q));
    });
  }, [applicants.data, query, job, state]);

  const stats = useMemo(() => {
    const all = applicants.data ?? [];
    const hiredSince = Date.now() - 30 * 86400000;
    const activeRows = all.filter((r) => r.operational_state === 'active' || r.operational_state === 'overdue');
    const ageRows = activeRows.filter((r) => r.age_days != null);
    return {
      active: activeRows.length,
      overdue: all.filter((r) => r.operational_state === 'overdue').length,
      unassigned: activeRows.filter((r) => r.recruiter_user_id == null).length,
      hired30: all.filter((r) => r.hired_at && new Date(r.hired_at).getTime() >= hiredSince).length,
      jobs: new Set(activeRows.map((r) => r.job_id).filter((v) => v != null)).size,
      avgAge: ageRows.length ? ageRows.reduce((sum, r) => sum + (r.age_days ?? 0), 0) / ageRows.length : null,
    };
  }, [applicants.data]);

  const stages = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of applicants.data ?? []) {
      if (row.operational_state !== 'active' && row.operational_state !== 'overdue') continue;
      const name = row.stage_name ?? 'بدون مرحلة';
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [applicants.data]);

  const field = 'min-h-[44px] rounded-xl border border-surface-line bg-white px-3 text-sm text-navy focus:border-brand-300';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy">التوظيف</h1>
        <p className="mt-0.5 text-xs text-ink-muted">مسار المتقدمين من Odoo Recruitment وحِمل كل مسؤول</p>
      </div>

      {applicants.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={0} />)}
        </div>
      ) : applicants.error ? (
        <Card><ErrorState error={applicants.error} onRetry={applicants.reload} /></Card>
      ) : (
        <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-6', applicants.refreshing && 'is-refetching')}>
          <StatTile label="متقدمون نشطون" value={fmtInt(stats.active)} tone="brand" icon={<IconRecruitment className="h-4 w-4" />} />
          <StatTile label="متابعة متأخرة" value={fmtInt(stats.overdue)} tone={stats.overdue ? 'bad' : 'ok'} icon={<IconClock className="h-4 w-4" />} />
          <StatTile label="بدون مسؤول" value={fmtInt(stats.unassigned)} tone={stats.unassigned ? 'warn' : 'ok'} icon={<IconUserOff className="h-4 w-4" />} />
          <StatTile label="تعيينات آخر 30 يوم" value={fmtInt(stats.hired30)} tone="ok" />
          <StatTile label="وظائف عليها متقدمون" value={fmtInt(stats.jobs)} />
          <StatTile label="متوسط عمر الطلب" value={stats.avgAge == null ? '—' : `${stats.avgAge.toFixed(1)} يوم`} />
        </div>
      )}

      <Card as="section">
        <SectionTitle title="خط سير التوظيف" subtitle="المتقدمون النشطون حسب المرحلة" />
        {applicants.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : stages.length === 0 ? (
          <EmptyState title="مفيش متقدمين نشطين" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {stages.map(([name, count]) => (
              <div key={name} className="rounded-xl border border-surface-line bg-slate-50 p-3">
                <p className="truncate text-xs font-semibold text-ink-muted" title={name}>{name}</p>
                <p className="mt-1 text-2xl font-extrabold text-navy">{fmtInt(count)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">ابحث في المتقدمين</span>
              <IconSearch className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="اسم المتقدم، الوظيفة، المرحلة، المسؤول…"
                className={cx(field, 'w-full ps-9')}
              />
            </label>
            <label className="lg:w-64">
              <span className="sr-only">الوظيفة</span>
              <select value={job} onChange={(e) => setJob(e.target.value)} className={cx(field, 'w-full')}>
                <option value="">كل الوظائف</option>
                {jobs.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {STATE_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setState(item.key)}
                aria-pressed={state === item.key}
                className={cx(
                  'tap min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold transition',
                  state === item.key ? 'bg-navy text-white' : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card as="section">
        <SectionTitle title="المتقدمون" subtitle={`${fmtInt(rows.length)} نتيجة`} />
        {applicants.loading ? (
          <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState title="مفيش نتائج بالفلاتر دي" hint="جرّب تغيّر الحالة أو الوظيفة." />
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-line text-xs text-ink-muted">
                  <th className="px-2 py-2 text-start font-medium">المتقدم</th>
                  <th className="px-2 py-2 text-start font-medium">الوظيفة</th>
                  <th className="px-2 py-2 text-start font-medium">المرحلة</th>
                  <th className="px-2 py-2 text-start font-medium">المسؤول</th>
                  <th className="px-2 py-2 text-start font-medium">وقت التقديم</th>
                  <th className="px-2 py-2 text-start font-medium">في المرحلة</th>
                  <th className="px-2 py-2 text-start font-medium">النشاط القادم</th>
                  <th className="px-2 py-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.applicant_id} className={cx('border-b border-surface-line/70 last:border-0', row.operational_state === 'overdue' && 'bg-status-badBg/45')}>
                    <td className="max-w-[180px] truncate px-2 py-2 font-semibold text-navy" title={row.applicant_name ?? ''}>{row.applicant_name ?? `#${row.applicant_id}`}</td>
                    <td className="max-w-[180px] truncate px-2 py-2 text-ink" title={row.job_name ?? ''}>{row.job_name ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{row.stage_name ?? '—'}</td>
                    <td className="max-w-[150px] truncate px-2 py-2 text-ink-muted">{row.recruiter_name ?? <span className="text-[#B45309]">غير مُسند</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-muted"><span title={fmtDate(row.applied_at)}>{fmtSince(row.applied_at)}</span></td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{row.stage_age_days == null ? '—' : `${row.stage_age_days.toFixed(1)} يوم`}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{fmtDate(row.next_activity_deadline)}</td>
                    <td className="whitespace-nowrap px-2 py-2">{statusBadge(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
