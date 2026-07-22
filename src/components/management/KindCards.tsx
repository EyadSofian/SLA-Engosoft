import type { ComponentType, SVGProps } from 'react';
import { motion } from 'framer-motion';
import type { MgmtKind } from '../../types/management';
import { KIND_ORDER } from '../../lib/management';
import { IconCalendar, IconCheck, IconClock, IconTarget, IconUsers } from '../Icons';
import { cx } from '../ui/primitives';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/** Icon + one-line explanation per kind — the tab's whole vocabulary. */
export const KIND_META: Record<MgmtKind, { label: string; hint: string; Icon: IconType }> = {
  task: { label: 'مهمة', hint: 'شغل مطلوب من حد', Icon: IconCheck },
  meeting: { label: 'اجتماع', hint: 'قعدة بأكتر من شخص', Icon: IconUsers },
  appointment: { label: 'موعد', hint: 'زيارة أو موعد خارجي', Icon: IconCalendar },
  reminder: { label: 'تذكير', hint: 'حاجة متتنسيش', Icon: IconClock },
  decision: { label: 'قرار', hint: 'قرار اتاخد ولازم يتسجّل', Icon: IconTarget },
};

/**
 * The pick-a-type row. Used twice: as the quick-add strip on the page (cards
 * with a hint line) and as the type switcher inside the form (compact chips).
 */
export function KindCards({
  value,
  onSelect,
  compact = false,
}: {
  value?: MgmtKind;
  onSelect: (kind: MgmtKind) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {KIND_ORDER.map((kind) => {
          const { label, Icon } = KIND_META[kind];
          const active = value === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onSelect(kind)}
              aria-pressed={active}
              className={cx(
                'tap inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition',
                active
                  ? 'bg-navy text-white'
                  : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {KIND_ORDER.map((kind) => {
        const { label, hint, Icon } = KIND_META[kind];
        return (
          <motion.button
            key={kind}
            type="button"
            onClick={() => onSelect(kind)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="card flex min-h-[92px] flex-col items-start gap-1.5 p-3.5 text-start transition hover:border-brand-200"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold text-navy">{label}</span>
            <span className="text-[11px] leading-tight text-ink-muted">{hint}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
