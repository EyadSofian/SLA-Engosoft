import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { MgmtItem, MgmtStatus } from '../../types/management';
import { PRIORITY_LABEL, STATUS_LABEL, isOverdue } from '../../lib/management';
import { fmtCountdown, fmtDateTime } from '../../lib/format';
import { KIND_META } from './KindCards';
import { Badge, cx } from '../ui/primitives';
import {
  IconCheck,
  IconClock,
  IconEdit,
  IconPin,
  IconPlay,
  IconRefresh,
  IconTelegram,
  IconTrash,
  IconUser,
  IconUsers,
} from '../Icons';

const actionBtn =
  'tap inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition';

/** Icon-only buttons still need a hit area — 36px is the floor that stays tappable. */
const iconBtn =
  'tap grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-faint transition hover:bg-slate-100 hover:text-navy';

export function ItemCard({
  item,
  busy = false,
  onStatus,
  onConfirm,
  onEdit,
  onDelete,
}: {
  item: MgmtItem;
  busy?: boolean;
  onStatus: (status: MgmtStatus) => void;
  onConfirm: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Two-step delete instead of window.confirm — same protection, no modal.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  const { label: kindLabel, Icon: KindIcon } = KIND_META[item.kind];
  const late = isOverdue(item);
  const closed = item.status === 'done' || item.status === 'cancelled';
  const remaining = item.due_at ? (new Date(item.due_at).getTime() - Date.now()) / 1000 : null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cx(
        'card flex flex-col gap-2.5 p-4',
        busy && 'is-refetching',
        closed && 'opacity-65',
        late && 'border-status-bad/35 bg-status-badBg/35',
        !late && item.needs_review && 'border-status-warn/45',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">
          <KindIcon className="h-3 w-3" />
          {kindLabel}
        </Badge>
        {item.priority !== 'normal' && (
          <Badge tone={item.priority === 'urgent' ? 'bad' : item.priority === 'high' ? 'warn' : 'neutral'}>
            {PRIORITY_LABEL[item.priority]}
          </Badge>
        )}
        {item.needs_review && <Badge tone="warn">محتاج مراجعة</Badge>}
        {closed && <Badge tone={item.status === 'done' ? 'ok' : 'neutral'}>{STATUS_LABEL[item.status]}</Badge>}
        {item.status === 'doing' && <Badge tone="brand">شغّال</Badge>}

        {item.source === 'telegram' && (
          <span className="ms-auto text-ink-faint" title={`من تليجرام${item.reporter ? ` — ${item.reporter}` : ''}`}>
            <IconTelegram className="h-4 w-4" />
          </span>
        )}
      </div>

      <div>
        <h3 className={cx('text-sm font-bold leading-snug text-navy', closed && 'line-through decoration-ink-faint')}>
          {item.title}
        </h3>
        {item.details && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted" title={item.details}>
            {item.details}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        {item.due_at ? (
          <span className={cx('inline-flex items-center gap-1', late && 'font-semibold text-status-bad')}>
            <IconClock className="h-3.5 w-3.5" />
            {fmtDateTime(item.due_at)}
            {!closed && remaining != null && (
              <span className="text-ink-faint">· {fmtCountdown(remaining)}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-ink-faint">
            <IconClock className="h-3.5 w-3.5" />
            من غير وقت
          </span>
        )}

        <span className="inline-flex items-center gap-1">
          <IconUser className="h-3.5 w-3.5" />
          {item.owner_name ?? <span className="text-[#B45309]">غير محدّد</span>}
        </span>

        {item.location && (
          <span className="inline-flex items-center gap-1">
            <IconPin className="h-3.5 w-3.5" />
            {item.location}
          </span>
        )}

        {item.attendees.length > 0 && (
          <span className="inline-flex items-center gap-1" title={item.attendees.join('، ')}>
            <IconUsers className="h-3.5 w-3.5" />
            {item.attendees.length}
          </span>
        )}

        {item.duration_min ? <span>{item.duration_min} دقيقة</span> : null}
      </div>

      <div className="flex items-start justify-between gap-2 border-t border-surface-line pt-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.needs_review && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={cx(actionBtn, 'bg-status-warnBg text-[#B45309] hover:bg-status-warn/25')}
            >
              <IconCheck className="h-3.5 w-3.5" />
              تأكيد
            </button>
          )}

          {/* An unconfirmed item can't meaningfully be "started" — confirming
              it is the action. Capping the row at two buttons also keeps it on
              one line at phone widths. */}
          {item.status === 'todo' && !item.needs_review && (
            <button
              type="button"
              onClick={() => onStatus('doing')}
              disabled={busy}
              className={cx(actionBtn, 'bg-brand-50 text-brand-700 hover:bg-brand-100')}
            >
              <IconPlay className="h-3.5 w-3.5" />
              ابدأ
            </button>
          )}

          {!closed && (
            <button
              type="button"
              onClick={() => onStatus('done')}
              disabled={busy}
              className={cx(actionBtn, 'bg-status-okBg text-status-ok hover:bg-status-ok/20')}
            >
              <IconCheck className="h-3.5 w-3.5" />
              خلص
            </button>
          )}

          {/* Cancelling lives in the edit sheet's status control — a fourth
              button here wraps the row on a phone for a rare action. */}
          {closed && (
            <button
              type="button"
              onClick={() => onStatus('todo')}
              disabled={busy}
              className={cx(actionBtn, 'text-ink-muted hover:bg-slate-100 hover:text-navy')}
            >
              <IconRefresh className="h-3.5 w-3.5" />
              رجّعها
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button type="button" onClick={onEdit} disabled={busy} aria-label="تعديل" className={iconBtn}>
            <IconEdit className="h-4 w-4" />
          </button>

          {armed ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className={cx(actionBtn, 'bg-status-badBg text-status-bad')}
            >
              متأكد؟
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setArmed(true)}
              disabled={busy}
              aria-label="حذف"
              className={cx(iconBtn, 'hover:bg-status-badBg hover:text-status-bad')}
            >
              <IconTrash className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
