import { useEffect, useMemo, useState } from 'react';
import type { MgmtDraft, MgmtItem, MgmtKind } from '../types/management';
import {
  MgmtError,
  clearSession,
  createItem,
  draftFrom,
  emptyDraft,
  fetchInbox,
  fetchItems,
  isOpen,
  isOverdue,
  isToday,
  patchItem,
  removeItem,
  sortItems,
  storedMeta,
  storedToken,
  type SessionMeta,
} from '../lib/management';
import { NOUN, arCount, fmtInt, fmtSince, fmtTime } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useRefresh } from '../hooks/useRefresh';
import { useErrorToast } from '../hooks/useErrorToast';
import { useToast } from '../components/ui/Toast';
import { StatTile } from '../components/ui/Stat';
import {
  Card,
  EmptyState,
  ErrorState,
  SectionTitle,
  Skeleton,
  SkeletonCard,
  cx,
} from '../components/ui/primitives';
import { ItemCard } from '../components/management/ItemCard';
import { ItemForm } from '../components/management/ItemForm';
import { KIND_META, KindCards } from '../components/management/KindCards';
import { PasscodeGate } from '../components/management/PasscodeGate';
import {
  IconAlert,
  IconCalendar,
  IconCheck,
  IconClock,
  IconLock,
  IconPlus,
  IconSearch,
  IconTelegram,
} from '../components/Icons';

type Lane = 'open' | 'today' | 'late' | 'review' | 'done' | 'all';

const LANES: Array<{ key: Lane; label: string }> = [
  { key: 'open', label: 'المفتوح' },
  { key: 'today', label: 'النهاردة' },
  { key: 'late', label: 'المتأخر' },
  { key: 'review', label: 'محتاج مراجعة' },
  { key: 'done', label: 'خلص' },
  { key: 'all', label: 'الكل' },
];

const fieldStyle =
  'min-h-[44px] rounded-xl border border-surface-line bg-white px-3 text-sm text-navy focus:border-brand-300';

export default function Management() {
  // A stored token means an unexpired session on this tab; the server still
  // re-checks it on every call, so this is only about which screen to show.
  const [meta, setMeta] = useState<SessionMeta | null>(() => (storedToken() ? storedMeta() : null));

  if (!meta) return <PasscodeGate onUnlocked={setMeta} />;

  return (
    <Workspace
      meta={meta}
      onLock={() => {
        clearSession();
        setMeta(null);
      }}
    />
  );
}

function Workspace({ meta, onLock }: { meta: SessionMeta; onLock: () => void }) {
  const { tick } = useRefresh();
  const toast = useToast();

  const load = useAsync(() => fetchItems({ days: 120 }), [tick]);
  const inbox = useAsync(() => fetchInbox(), [tick]);

  // The list is held locally so a status flip repaints instantly instead of
  // waiting on a refetch — the same reason the rest of the app never
  // re-skeletons on refresh.
  const [items, setItems] = useState<MgmtItem[]>([]);
  useEffect(() => {
    if (load.data) setItems(load.data);
  }, [load.data]);

  // An expired token can't be recovered from — drop back to the gate.
  useEffect(() => {
    if (load.error instanceof MgmtError && load.error.status === 401) onLock();
  }, [load.error, onLock]);

  useErrorToast(load.error);

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<MgmtKind | 'all'>('all');
  const [lane, setLane] = useState<Lane>('open');
  const [owner, setOwner] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item?: MgmtItem; draft: MgmtDraft } | null>(null);

  const owners = useMemo(
    () => [...new Set(items.map((i) => i.owner_name).filter(Boolean))].sort() as string[],
    [items],
  );

  const stats = useMemo(() => {
    const open = items.filter(isOpen);
    return {
      today: open.filter((i) => isToday(i.due_at)).length,
      late: open.filter(isOverdue).length,
      meetings: open.filter((i) => isToday(i.due_at) && (i.kind === 'meeting' || i.kind === 'appointment')).length,
      review: open.filter((i) => i.needs_review).length,
      open: open.length,
      doneToday: items.filter((i) => i.status === 'done' && isToday(i.done_at)).length,
    };
  }, [items]);

  const agenda = useMemo(
    () => sortItems(items.filter((i) => isOpen(i) && isToday(i.due_at))),
    [items],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sortItems(
      items.filter((item) => {
        if (kind !== 'all' && item.kind !== kind) return false;
        if (owner && item.owner_name !== owner) return false;

        if (lane === 'open' && !isOpen(item)) return false;
        if (lane === 'today' && !(isOpen(item) && isToday(item.due_at))) return false;
        if (lane === 'late' && !isOverdue(item)) return false;
        if (lane === 'review' && !(item.needs_review && isOpen(item))) return false;
        if (lane === 'done' && item.status !== 'done') return false;

        if (!q) return true;
        return [item.title, item.details, item.owner_name, item.location, item.raw_text, ...item.tags].some(
          (value) => value?.toLowerCase().includes(q),
        );
      }),
    );
  }, [items, query, kind, lane, owner]);

  async function mutate(id: string, patch: Partial<MgmtDraft> & { needs_review?: boolean }) {
    setBusyId(id);
    try {
      const updated = await patchItem(id, patch);
      setItems((list) => list.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'حصلت مشكلة أثناء التعديل.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function destroy(id: string) {
    setBusyId(id);
    try {
      await removeItem(id);
      setItems((list) => list.filter((item) => item.id !== id));
      toast('اتحذف.', 'info');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'حصلت مشكلة أثناء الحذف.', 'error');
    } finally {
      setBusyId(null);
    }
  }

  /** Throws on failure — the form renders the message inline and stays open. */
  async function save(draft: MgmtDraft) {
    if (editing?.item) {
      const updated = await patchItem(editing.item.id, draft);
      setItems((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      toast('اتحفظ التعديل.', 'success');
    } else {
      const created = await createItem(draft);
      setItems((list) => [created, ...list]);
      toast('اتضاف.', 'success');
    }
    setEditing(null);
  }

  const entries = inbox.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy">الإدارة</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            مهام ومواعيد الإدارة — بتتسجّل من اللوحة أو من رسايل تليجرام بعد ما الـ AI يحلّلها
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLock}
            className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-surface-line bg-white px-3 text-xs font-semibold text-ink-muted transition hover:text-navy"
          >
            <IconLock className="h-4 w-4" />
            قفل
          </button>
          <button
            type="button"
            onClick={() => setEditing({ draft: emptyDraft('task') })}
            className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-navy px-4 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            <IconPlus className="h-4 w-4" />
            إضافة
          </button>
        </div>
      </div>

      {load.loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={0} />
          ))}
        </div>
      ) : load.error ? (
        <Card>
          <ErrorState error={load.error} onRetry={load.reload} />
        </Card>
      ) : (
        <div className={cx('grid grid-cols-2 gap-3 lg:grid-cols-6', load.refreshing && 'is-refetching')}>
          <StatTile
            label="مستحق النهاردة"
            value={fmtInt(stats.today)}
            tone="brand"
            icon={<IconCalendar className="h-4 w-4" />}
          />
          <StatTile
            label="متأخر"
            value={fmtInt(stats.late)}
            tone={stats.late ? 'bad' : 'ok'}
            icon={<IconClock className="h-4 w-4" />}
          />
          <StatTile
            label="اجتماعات ومواعيد النهاردة"
            value={fmtInt(stats.meetings)}
            icon={<KIND_META.meeting.Icon className="h-4 w-4" />}
          />
          <StatTile
            label="محتاج مراجعة"
            value={fmtInt(stats.review)}
            tone={stats.review ? 'warn' : 'ok'}
            icon={<IconAlert className="h-4 w-4" />}
          />
          <StatTile label="مفتوح" value={fmtInt(stats.open)} />
          <StatTile
            label="خلص النهاردة"
            value={fmtInt(stats.doneToday)}
            tone="ok"
            icon={<IconCheck className="h-4 w-4" />}
          />
        </div>
      )}

      <section>
        <SectionTitle title="ضيف بسرعة" subtitle="اختار النوع وهيفتحلك النموذج جاهز" />
        <KindCards onSelect={(selected) => setEditing({ draft: emptyDraft(selected) })} />
      </section>

      <Card as="section">
        <SectionTitle
          title="أجندة النهاردة"
          subtitle={agenda.length ? `${arCount(agenda.length, NOUN.item)} مستحق` : undefined}
        />
        {load.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : agenda.length === 0 ? (
          <EmptyState title="مفيش حاجة مستحقّة النهاردة" hint="أي بند بوقت النهاردة هيظهر هنا بالترتيب." />
        ) : (
          <ol className="space-y-1.5">
            {agenda.map((item) => {
              const { Icon } = KIND_META[item.kind];
              const late = isOverdue(item);
              return (
                <li
                  key={item.id}
                  className={cx(
                    'flex items-center gap-3 rounded-xl border border-surface-line bg-slate-50 px-3 py-2.5',
                    late && 'border-status-bad/30 bg-status-badBg/50',
                  )}
                >
                  <span
                    className={cx(
                      'w-[62px] shrink-0 text-sm font-bold tabular-nums',
                      late ? 'text-status-bad' : 'text-navy',
                    )}
                  >
                    {fmtTime(item.due_at)}
                  </span>
                  <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={item.title}>
                    {item.title}
                  </span>
                  {item.owner_name && (
                    <span className="hidden shrink-0 text-[11px] text-ink-muted sm:inline">{item.owner_name}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">ابحث في بنود الإدارة</span>
              <IconSearch className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="العنوان، المسؤول، المكان، نص الرسالة…"
                className={cx(fieldStyle, 'w-full ps-9')}
              />
            </label>

            <label className="lg:w-52">
              <span className="sr-only">المسؤول</span>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className={cx(fieldStyle, 'w-full')}
              >
                <option value="">كل المسؤولين</option>
                {owners.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="lg:w-40">
              <span className="sr-only">النوع</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MgmtKind | 'all')}
                className={cx(fieldStyle, 'w-full')}
              >
                <option value="all">كل الأنواع</option>
                {(Object.keys(KIND_META) as MgmtKind[]).map((key) => (
                  <option key={key} value={key}>
                    {KIND_META[key].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {LANES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setLane(item.key)}
                aria-pressed={lane === item.key}
                className={cx(
                  'tap min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold transition',
                  lane === item.key
                    ? 'bg-navy text-white'
                    : 'border border-surface-line bg-white text-ink-muted hover:text-navy',
                )}
              >
                {item.label}
                {item.key === 'review' && stats.review > 0 && (
                  <span className="ms-1.5 rounded-full bg-status-warn/25 px-1.5 py-0.5 text-[10px] text-[#B45309]">
                    {stats.review}
                  </span>
                )}
                {item.key === 'late' && stats.late > 0 && (
                  <span className="ms-1.5 rounded-full bg-status-bad/20 px-1.5 py-0.5 text-[10px] text-status-bad">
                    {stats.late}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <section>
        <SectionTitle title="البنود" subtitle={arCount(rows.length, NOUN.result)} />
        {load.loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              title={items.length === 0 ? 'لسه مفيش بنود' : 'مفيش نتائج بالفلاتر دي'}
              hint={
                items.length === 0
                  ? 'ابعت اللي مطلوب النهاردة على بوت تليجرام، أو ضيف بند من زرار الإضافة.'
                  : 'جرّب تغيّر الحالة أو النوع.'
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onStatus={(status) => mutate(item.id, { status })}
                onConfirm={() => mutate(item.id, { needs_review: false })}
                onEdit={() => setEditing({ item, draft: draftFrom(item) })}
                onDelete={() => destroy(item.id)}
              />
            ))}
          </div>
        )}
      </section>

      <Card as="section">
        <SectionTitle
          title="الوارد من تليجرام"
          subtitle={meta.ai_enabled ? 'آخر الرسايل اللي وصلت واتحلّلت' : 'المساعد الذكي مش مفعّل — الرسايل بتتسجّل خام'}
        />
        {inbox.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="لسه مفيش رسايل"
            hint="أول ما البوت يستقبل رسالة هتلاقيها هنا بنصّها الأصلي وعدد البنود اللي طلعت منها."
          />
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cx(
                  'rounded-xl border border-surface-line bg-slate-50 p-3',
                  entry.status === 'failed' && 'border-status-bad/30 bg-status-badBg/40',
                )}
              >
                <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                  <IconTelegram className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-semibold text-navy">{entry.sender ?? 'مجهول'}</span>
                  <span>{fmtSince(entry.created_at)}</span>
                  <span className="ms-auto shrink-0">
                    {entry.status === 'failed'
                      ? 'فشل التحليل'
                      : entry.item_count > 0
                        ? arCount(entry.item_count, NOUN.item)
                        : 'مفيش بنود'}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink" title={entry.raw_text}>
                  {entry.raw_text}
                </p>
                {/* The reason is already stored — printing it here is the
                    difference between "it failed" and a fixable report. */}
                {entry.status === 'failed' && entry.error && (
                  <p
                    dir="ltr"
                    className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-white/70 px-2 py-1 text-start font-mono text-[10px] leading-relaxed text-status-bad"
                  >
                    {entry.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <ItemForm
          key={editing.item?.id ?? 'new'}
          initial={editing.draft}
          heading={editing.item ? 'تعديل البند' : 'بند جديد'}
          team={meta.team}
          departments={meta.departments}
          showStatus={Boolean(editing.item)}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
