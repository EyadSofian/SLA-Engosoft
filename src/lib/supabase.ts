/**
 * Minimal typed PostgREST client for Supabase.
 *
 * Read-only by design: the browser only ever holds the *publishable* (anon) key,
 * and every table it touches is exposed through a `for select to anon` policy.
 * See supabase/policies.sql.
 */

const BASE = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isConfigured = Boolean(BASE && KEY);

/** A failure we can show to a manager without leaking internals. */
export class SupabaseError extends Error {
  readonly status: number;
  readonly hint?: string;

  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
    this.hint = hint;
  }
}

const CONFIG_MSG =
  'إعدادات الاتصال ناقصة. لازم تحطّ VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في متغيّرات البيئة.';

function headers(extra?: Record<string, string>): HeadersInit {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Accept: 'application/json',
    ...extra,
  };
}

/** Turn a PostgREST error body into Arabic copy a non-engineer can act on. */
async function toError(res: Response): Promise<SupabaseError> {
  let body: { message?: string; hint?: string; code?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body — fall through to the status-based message */
  }

  const raw = body.message ?? res.statusText;

  if (res.status === 401 || res.status === 403) {
    return new SupabaseError(
      'مفيش صلاحية للقراءة من قاعدة البيانات. لازم تتطبّق سياسات القراءة (RLS) الأول.',
      res.status,
      'شغّل ملف supabase/policies.sql في الـ SQL Editor بتاع Supabase.',
    );
  }
  if (res.status === 404) {
    return new SupabaseError(`الجدول أو الـ view مش موجود: ${raw}`, res.status, body.hint);
  }
  if (res.status === 429) {
    return new SupabaseError('طلبات كتير في وقت قصير. استنّى شوية وجرّب تاني.', res.status);
  }
  return new SupabaseError(raw || 'حصلت مشكلة أثناء تحميل البيانات.', res.status, body.hint);
}

async function request(path: string, extraHeaders?: Record<string, string>): Promise<Response> {
  if (!isConfigured) throw new SupabaseError(CONFIG_MSG, 0);

  let res: Response;
  try {
    res = await fetch(`${BASE}/rest/v1/${path}`, { headers: headers(extraHeaders) });
  } catch {
    throw new SupabaseError('تعذّر الاتصال بالسيرفر. اطمّن على النت وجرّب تاني.', 0);
  }

  if (!res.ok) throw await toError(res);
  return res;
}

export interface QueryOptions {
  /** Columns to return, e.g. `'team_name,open_cnt'`. Defaults to `*`. */
  select?: string;
  /** Raw PostgREST filters, e.g. `{ is_open: 'eq.true', team_name: 'eq.IT' }`. */
  filter?: Record<string, string | number | boolean | undefined>;
  /** e.g. `'achieved_total.desc'` */
  order?: string;
  limit?: number;
}

function buildQuery({ select = '*', filter, order, limit }: QueryOptions = {}): string {
  const params = new URLSearchParams();
  params.set('select', select);

  for (const [key, value] of Object.entries(filter ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  if (order) params.set('order', order);
  if (limit != null) params.set('limit', String(limit));

  return params.toString();
}

/** Fetch rows from a table or view. */
export async function select<T>(source: string, options?: QueryOptions): Promise<T[]> {
  const res = await request(`${source}?${buildQuery(options)}`);
  return (await res.json()) as T[];
}

/**
 * Count matching rows without transferring them — asks PostgREST for an exact
 * count and reads it off the Content-Range header.
 */
export async function count(
  source: string,
  filter?: QueryOptions['filter'],
): Promise<number> {
  const query = buildQuery({ select: 'count', filter, limit: 1 });
  const res = await request(`${source}?${query}`, { Prefer: 'count=exact' });

  const range = res.headers.get('content-range'); // e.g. "0-0/128"
  const total = range?.split('/')[1];
  if (total && total !== '*') return Number(total);

  // Header not exposed by the proxy — fall back to counting the payload.
  const rows = (await res.json()) as unknown[];
  return rows.length;
}
