/**
 * Arabic (Egypt) formatting helpers.
 *
 * Digits stay Latin (`-u-nu-latn`): Egyptian dashboards read numbers in Western
 * numerals, and they align far better in tables and on axes.
 */

const AR = 'ar-EG-u-nu-latn';

const intFmt = new Intl.NumberFormat(AR, { maximumFractionDigits: 0 });
const oneDp = new Intl.NumberFormat(AR, { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/**
 * Currency is configurable because the database doesn't record one — the
 * amount columns are bare numbers. Set VITE_CURRENCY to switch the whole app.
 * Symbol-prefix currencies (USD/EUR) and suffix currencies (EGP/SAR) both
 * render in their conventional position.
 */
const CURRENCIES: Record<string, { prefix?: string; suffix?: string }> = {
  EGP: { suffix: 'ج.م' },
  USD: { prefix: '$' },
  EUR: { prefix: '€' },
  GBP: { prefix: '£' },
  SAR: { suffix: 'ر.س' },
  AED: { suffix: 'د.إ' },
  KWD: { suffix: 'د.ك' },
};

const CURRENCY_CODE = (import.meta.env.VITE_CURRENCY ?? 'EGP').toUpperCase();
const CURRENCY = CURRENCIES[CURRENCY_CODE] ?? { suffix: CURRENCY_CODE };

/** The active currency mark, e.g. `ج.م` or `$`. */
export const MONEY_MARK = CURRENCY.prefix ?? CURRENCY.suffix ?? '';

function withCurrency(text: string): string {
  return CURRENCY.prefix ? `${CURRENCY.prefix}${text}` : `${text} ${CURRENCY.suffix}`;
}

/** `12,480` */
export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return intFmt.format(Math.round(n));
}

/** `1,240,500 ج.م` / `$1,240,500` — where the number sits beside others. */
export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return withCurrency(intFmt.format(Math.round(n)));
}

/** `1.2 مليون ج.م` / `$1.2 مليون` — for hero figures and stat tiles. */
export function fmtMoneyCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return withCurrency(`${oneDp.format(n / 1_000_000)} مليون`);
  if (abs >= 10_000) return withCurrency(`${oneDp.format(n / 1_000)} ألف`);
  return withCurrency(intFmt.format(Math.round(n)));
}

/** `92.4%` */
export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${oneDp.format(Number(n.toFixed(digits)))}%`;
}

/** Hours become days once they stop being readable as hours. */
export function fmtHours(h: number | null | undefined): string {
  if (h == null || Number.isNaN(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)} د`;
  if (h < 48) return `${oneDp.format(h)} ساعة`;
  return `${oneDp.format(h / 24)} يوم`;
}

/** Seconds of call time → `12:05` style. */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return '—';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** `4.3 / 5` */
export function fmtCsat(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${oneDp.format(v)} / 5`;
}

/**
 * Arabic counted-noun agreement. Getting this wrong is the tell that a UI was
 * machine-translated: «٢ تذكرة» reads broken where «تذكرتين» reads native.
 *   1        → singular, number dropped   (تذكرة واحدة)
 *   2        → dual, number dropped       (تذكرتين)
 *   3–10     → number + plural            (٦ تذاكر)
 *   11+ / 0  → number + singular          (١٢ تذكرة)
 */
export interface ArNoun {
  one: string;
  two: string;
  few: string;
  many: string;
}

export function arCount(count: number | null | undefined, noun: ArNoun): string {
  if (count == null || Number.isNaN(count)) return '—';
  const c = Math.abs(Math.round(count));
  if (c === 1) return noun.one;
  if (c === 2) return noun.two;
  const word = c >= 3 && c <= 10 ? noun.few : noun.many;
  return `${fmtInt(count)} ${word}`;
}

export const NOUN = {
  ticket: { one: 'تذكرة واحدة', two: 'تذكرتين', few: 'تذاكر', many: 'تذكرة' },
  day: { one: 'يوم واحد', two: 'يومين', few: 'أيام', many: 'يوم' },
  dept: { one: 'قسم واحد', two: 'قسمين', few: 'أقسام', many: 'قسم' },
  deal: { one: 'صفقة واحدة', two: 'صفقتين', few: 'صفقات', many: 'صفقة' },
  person: { one: 'فرد واحد', two: 'فردين', few: 'أفراد', many: 'فرد' },
  agent: { one: 'موظف واحد', two: 'موظفين', few: 'موظفين', many: 'موظف' },
  quote: { one: 'عرض واحد', two: 'عرضين', few: 'عروض', many: 'عرض' },
  call: { one: 'مكالمة واحدة', two: 'مكالمتين', few: 'مكالمات', many: 'مكالمة' },
} satisfies Record<string, ArNoun>;

const dateFmt = new Intl.DateTimeFormat(AR, { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat(AR, { day: '2-digit', month: '2-digit' });
const monthFmt = new Intl.DateTimeFormat(AR, { month: 'long', year: 'numeric' });
const shortMonthFmt = new Intl.DateTimeFormat(AR, { month: 'short', year: '2-digit' });

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : shortDateFmt.format(d);
}

/**
 * `"2026-07-01"` → `"يوليو 2026"`. Parsed component-wise so a date-only string
 * is never shifted a day by the UTC→local conversion.
 */
export function fmtMonth(monthStr: string | null | undefined, short = false): string {
  if (!monthStr) return '—';
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m) return monthStr;
  const d = new Date(y, m - 1, 1);
  return (short ? shortMonthFmt : monthFmt).format(d);
}

/** First day of the month containing `d`, as `YYYY-MM-01`. */
export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Local start of today as an ISO timestamp — for "opened / closed today". */
export function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Today, spelled out — used in page headers. */
export function todayLabel(): string {
  return dateFmt.format(new Date());
}
