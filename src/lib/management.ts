/**
 * Client for /api/management/*.
 *
 * The rest of the dashboard talks to Supabase directly with the publishable
 * key. Management data doesn't: it is internal, so it is only reachable
 * through the server, which holds the secret key and checks a passcode token.
 * That token lives in sessionStorage — it dies with the tab, on purpose.
 */

import type {
  MgmtDraft,
  MgmtIngestEntry,
  MgmtItem,
  MgmtKind,
  MgmtPriority,
  MgmtSession,
  MgmtStatus,
} from '../types/management';

const TOKEN_KEY = 'engosoft.mgmt.token';
const META_KEY = 'engosoft.mgmt.meta';

export type SessionMeta = Omit<MgmtSession, 'token'>;

export class MgmtError extends Error {
  readonly status: number;
  readonly hint?: string;

  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.name = 'MgmtError';
    this.status = status;
    this.hint = hint;
  }
}

/** sessionStorage throws in private-mode Safari; a dead session is recoverable. */
function safeRead(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the session just won't survive a reload */
  }
}

export function storedToken(): string | null {
  return safeRead(TOKEN_KEY);
}

export function storedMeta(): SessionMeta | null {
  const raw = safeRead(META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

export function clearSession() {
  safeWrite(TOKEN_KEY, null);
  safeWrite(META_KEY, null);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = storedToken();

  let res: Response;
  try {
    res = await fetch(`/api/management/${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new MgmtError('تعذّر الاتصال بالسيرفر. اطمّن على النت وجرّب تاني.', 0);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string; hint?: string } & T;

  if (!res.ok) {
    // An expired or tampered token can't be salvaged — drop it so the page
    // falls back to the passcode gate instead of looping on 401s.
    if (res.status === 401) clearSession();
    throw new MgmtError(data.error ?? 'حصلت مشكلة. جرّب تاني.', res.status, data.hint);
  }

  return data;
}

export async function openSession(passcode: string): Promise<SessionMeta> {
  const session = await call<MgmtSession>('session', {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  });

  const { token, ...meta } = session;
  safeWrite(TOKEN_KEY, token);
  safeWrite(META_KEY, JSON.stringify(meta));
  return meta;
}

export async function fetchItems(params: { status?: string; days?: number } = {}): Promise<MgmtItem[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.days) query.set('days', String(params.days));
  const { items } = await call<{ items: MgmtItem[] }>(`items?${query.toString()}`);
  return items;
}

export async function fetchInbox(): Promise<MgmtIngestEntry[]> {
  const { entries } = await call<{ entries: MgmtIngestEntry[] }>('inbox?limit=20');
  return entries;
}

/** Form values → API body. Empty strings become nulls; local time becomes UTC. */
function toBody(draft: Partial<MgmtDraft>): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (draft.kind !== undefined) body.kind = draft.kind;
  if (draft.title !== undefined) body.title = draft.title.trim();
  if (draft.details !== undefined) body.details = draft.details.trim();
  if (draft.owner_name !== undefined) body.owner_name = draft.owner_name.trim();
  if (draft.department !== undefined) body.department = draft.department.trim();
  if (draft.priority !== undefined) body.priority = draft.priority;
  if (draft.status !== undefined) body.status = draft.status;
  if (draft.location !== undefined) body.location = draft.location.trim();

  if (draft.due_at !== undefined) {
    // `datetime-local` has no zone; the browser's own zone is the right one to
    // read it in — whoever types 2pm means 2pm where they are sitting.
    body.due_at = draft.due_at ? new Date(draft.due_at).toISOString() : null;
  }
  if (draft.duration_min !== undefined) {
    body.duration_min = draft.duration_min ? Number(draft.duration_min) : null;
  }
  if (draft.attendees !== undefined) {
    body.attendees = draft.attendees
      .split(/[,،\n]/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  return body;
}

export async function createItem(draft: MgmtDraft): Promise<MgmtItem> {
  const { item } = await call<{ item: MgmtItem }>('items', {
    method: 'POST',
    body: JSON.stringify(toBody(draft)),
  });
  return item;
}

export async function patchItem(
  id: string,
  patch: Partial<MgmtDraft> & { needs_review?: boolean },
): Promise<MgmtItem> {
  const body = toBody(patch);
  if (patch.needs_review !== undefined) body.needs_review = patch.needs_review;

  const { item } = await call<{ item: MgmtItem }>(`items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return item;
}

export async function removeItem(id: string): Promise<void> {
  await call(`items/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────
// Labels & shared vocabulary. One place, so a card, a filter chip and the
// form can never disagree about what `appointment` is called in Arabic.
// ─────────────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<MgmtKind, string> = {
  task: 'مهمة',
  meeting: 'اجتماع',
  appointment: 'موعد',
  reminder: 'تذكير',
  decision: 'قرار',
};

export const PRIORITY_LABEL: Record<MgmtPriority, string> = {
  urgent: 'عاجل',
  high: 'مهم',
  normal: 'عادي',
  low: 'مؤجّل',
};

export const STATUS_LABEL: Record<MgmtStatus, string> = {
  todo: 'لسه',
  doing: 'شغّال',
  done: 'خلص',
  cancelled: 'ملغي',
};

export const KIND_ORDER: MgmtKind[] = ['task', 'meeting', 'appointment', 'reminder', 'decision'];
export const PRIORITY_ORDER: MgmtPriority[] = ['urgent', 'high', 'normal', 'low'];
export const STATUS_ORDER: MgmtStatus[] = ['todo', 'doing', 'done', 'cancelled'];

/** Rank used for sorting — urgent first, then by how soon it's due. */
const PRIORITY_RANK: Record<MgmtPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function sortItems(items: MgmtItem[]): MgmtItem[] {
  return [...items].sort((a, b) => {
    const open = (item: MgmtItem) => (item.status === 'todo' || item.status === 'doing' ? 0 : 1);
    if (open(a) !== open(b)) return open(a) - open(b);

    // Anything with a deadline outranks anything without one.
    if (a.due_at && b.due_at) return a.due_at.localeCompare(b.due_at);
    if (a.due_at) return -1;
    if (b.due_at) return 1;

    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

export function isOpen(item: MgmtItem): boolean {
  return item.status === 'todo' || item.status === 'doing';
}

export function isOverdue(item: MgmtItem): boolean {
  return isOpen(item) && Boolean(item.due_at) && new Date(item.due_at as string).getTime() < Date.now();
}

/** Is `iso` inside today's local calendar day? */
export function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** ISO timestamp → the `datetime-local` string an input can display. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function draftFrom(item: MgmtItem): MgmtDraft {
  return {
    kind: item.kind,
    title: item.title,
    details: item.details ?? '',
    owner_name: item.owner_name ?? '',
    department: item.department ?? '',
    priority: item.priority,
    status: item.status,
    due_at: toLocalInput(item.due_at),
    duration_min: item.duration_min ? String(item.duration_min) : '',
    location: item.location ?? '',
    attendees: item.attendees.join('، '),
  };
}

export function emptyDraft(kind: MgmtKind = 'task'): MgmtDraft {
  return {
    kind,
    title: '',
    details: '',
    owner_name: '',
    department: '',
    priority: 'normal',
    status: 'todo',
    due_at: '',
    // A meeting with no length is the usual cause of a double-booked hour.
    duration_min: kind === 'meeting' ? '60' : '',
    location: '',
    attendees: '',
  };
}
