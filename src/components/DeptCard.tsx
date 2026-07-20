import { Link } from 'react-router-dom';
import type { DeptSummary } from '../types/db';
import { deptHealth, healthReason } from '../lib/metrics';
import { fmtInt } from '../lib/format';
import { Ring, StatusPill } from './ui/Stat';
import { IconBack } from './Icons';

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'warn' }) {
  const color =
    value === 0
      ? 'text-ink-faint'
      : tone === 'bad'
        ? 'text-status-bad'
        : tone === 'warn'
          ? 'text-[#B45309]'
          : 'text-navy';

  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-bold leading-none ${color}`}>{fmtInt(value)}</p>
    </div>
  );
}

export function DeptCard({ dept }: { dept: DeptSummary }) {
  const health = deptHealth(dept);
  const reason = healthReason(dept);

  return (
    <Link
      to={`/dept/${encodeURIComponent(dept.team_name)}`}
      className="tap group card block p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-navy sm:text-base">{dept.team_name}</h3>
          <div className="mt-1.5">
            <StatusPill health={health} reason={reason} />
          </div>
        </div>
        <Ring value={dept.sla_met_pct} size={64} stroke={7} label="SLA" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-surface-line pt-3">
        <Metric label="مفتوح" value={dept.open_cnt} />
        <Metric label="مقفول" value={dept.closed_cnt} />
        <Metric label="غير مُسند" value={dept.unassigned_cnt} tone="warn" />
        <Metric label="عاجل" value={dept.urgent_cnt} tone="warn" />
        <Metric label="SLA متأخر" value={dept.failed_cnt} tone="bad" />
        <Metric label="فات أسبوع" value={dept.backlog_7p} tone="bad" />
      </div>

      {reason && (
        <p className="mt-3 truncate text-[11px] text-ink-muted" title={reason}>
          {reason}
        </p>
      )}

      <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 transition group-hover:gap-1.5">
        التفاصيل
        <IconBack className="h-3.5 w-3.5 rotate-180" />
      </span>
    </Link>
  );
}
