/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Engosoft brand — navy / blue / orange
        navy: '#0B2545',
        // Brand blue scale. 300/500/900 are the validated ordinal ramp used by
        // the aging-bucket chart (light -> dark, single hue).
        brand: {
          50: '#EFF6FC',
          100: '#D8E9F7',
          200: '#B4D4EF',
          300: '#6FA9DA',
          400: '#4A8FCB',
          500: '#1D6FB8',
          600: '#175C99',
          700: '#12497A',
          800: '#0E385E',
          900: '#0B2545',
          DEFAULT: '#1D6FB8',
        },
        // Accent — CTAs, highlights. Never used as a chart fill (fails the
        // 3:1 contrast-vs-surface check for large data marks).
        accent: {
          50: '#FEF4E9',
          100: '#FDE3C6',
          400: '#F79B4A',
          500: '#F5821F',
          600: '#D96C0E',
          DEFAULT: '#F5821F',
        },
        surface: {
          bg: '#F6F8FB',
          card: '#FFFFFF',
          line: '#E6ECF3',
        },
        ink: {
          DEFAULT: '#0B2545',
          muted: '#64748B',
          faint: '#94A3B8',
        },
        // Reserved status palette — never reused as a series color.
        // Always shipped with a text label, never colour alone.
        status: {
          ok: '#16A34A',
          okBg: '#E8F7EE',
          warn: '#F59E0B',
          warnBg: '#FEF5E3',
          bad: '#DC2626',
          badBg: '#FDECEC',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,37,69,0.04), 0 10px 28px -14px rgba(11,37,69,0.16)',
        lift: '0 2px 4px rgba(11,37,69,0.06), 0 18px 40px -18px rgba(11,37,69,0.28)',
        panel: '0 24px 60px -20px rgba(11,37,69,0.38)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(-100%)' } },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'panel-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        'fade-up': 'fade-up 0.28s ease-out both',
        'panel-in': 'panel-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};
