/**
 * Chart tokens — the single source of truth for anything drawn with Recharts.
 *
 * Every palette here was checked with the dataviz validator against a white
 * card surface:
 *   • ORDINAL (aging buckets)  one hue, monotone lightness, light end clears 2:1
 *   • SERIES  (single-series)  inside the lightness band, ≥3:1 vs surface
 *   • STATUS                   reserved; green↔red is not CVD-separable, so a
 *                              status colour never travels without its label.
 */

/** Ordered age bands: one hue, light → dark. Never status colours — these are
 *  ordinal buckets, and a green/amber/red ramp would double-encode magnitude. */
export const ORDINAL_3 = ['#6FA9DA', '#1D6FB8', '#0B2545'] as const;

/** Slot 1 — the only colour a single-series chart ever uses. */
export const SERIES = '#1D6FB8';

/** Reserved status palette. Always paired with a text label. */
export const STATUS = {
  ok: '#16A34A',
  warn: '#F59E0B',
  bad: '#DC2626',
} as const;

/** Chrome: hairline, solid, one step off the surface. Never dashed. */
export const CHART = {
  grid: '#E6ECF3',
  axis: '#94A3B8',
  surface: '#FFFFFF',
  /** Bars are capped rather than filling their band — the leftover is air. */
  maxBarSize: 24,
  /** 4px rounded data-end, square at the baseline. */
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadiusRTL: [0, 4, 4, 0] as [number, number, number, number],
} as const;

/** Shared Recharts tooltip chrome. */
export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #E6ECF3',
    boxShadow: '0 10px 28px -14px rgba(11,37,69,0.28)',
    fontFamily: 'Cairo, sans-serif',
    fontSize: 13,
    direction: 'rtl' as const,
    padding: '8px 12px',
  },
  labelStyle: { color: '#0B2545', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: '#64748B' },
  cursor: { fill: 'rgba(29,111,184,0.06)' },
};
