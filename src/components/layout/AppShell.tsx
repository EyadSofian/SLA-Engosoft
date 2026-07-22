import { NavLink, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { IconDepartments, IconHome, IconInbox, IconRecruitment, IconRefresh, IconSales } from '../Icons';
import { cx } from '../ui/primitives';
import { useRefresh } from '../../hooks/useRefresh';
import { todayLabel } from '../../lib/format';

const NAV = [
  { to: '/', label: 'الرئيسية', Icon: IconHome, end: true },
  { to: '/depts', label: 'الأقسام', Icon: IconDepartments, end: false },
  { to: '/tickets', label: 'التذاكر', Icon: IconInbox, end: false },
  { to: '/sales', label: 'المبيعات', Icon: IconSales, end: false },
  { to: '/recruitment', label: 'التوظيف', Icon: IconRecruitment, end: false },
] as const;

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
        <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
          <rect x="5" y="17" width="5" height="9" rx="1.5" fill="#6FA9DA" />
          <rect x="13.5" y="11" width="5" height="15" rx="1.5" fill="#4A8FCB" />
          <rect x="22" y="6" width="5" height="20" rx="1.5" fill="#F5821F" />
        </svg>
      </span>
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold leading-tight text-white">Engosoft</p>
          <p className="truncate text-[11px] leading-tight text-white/60">لوحة أداء الأقسام</p>
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col bg-navy px-4 py-5 lg:flex">
      <Logo />

      <nav className="mt-8 flex-1 space-y-1" aria-label="التنقّل الرئيسي">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                isActive
                  ? 'bg-brand-500 text-white shadow-[0_8px_20px_-10px_rgba(29,111,184,0.9)]'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <p className="border-t border-white/10 pt-4 text-[11px] leading-relaxed text-white/40">
        البيانات بتتحدّث من Supabase مباشرة. العرض للقراءة بس.
      </p>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="التنقّل الرئيسي"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'tap flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold transition',
                isActive ? 'text-brand-600' : 'text-ink-faint',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cx('h-[22px] w-[22px]', isActive && 'stroke-[2.1]')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Header({ title }: { title: string }) {
  const { refresh } = useRefresh();

  return (
    <header className="sticky top-0 z-30 border-b border-surface-line bg-surface-bg/85 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0 lg:hidden">
          <div className="rounded-xl bg-navy px-2.5 py-1.5">
            <Logo compact />
          </div>
        </div>

        <div className="hidden min-w-0 lg:block">
          <h1 className="truncate text-lg font-extrabold text-navy">{title}</h1>
          <p className="truncate text-xs text-ink-muted">{todayLabel()}</p>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="tap inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-surface-line bg-white px-3.5 text-sm font-semibold text-navy shadow-card transition hover:border-brand-200 hover:text-brand-600"
        >
          <IconRefresh className="h-4 w-4" />
          <span className="hidden sm:inline">تحديث</span>
        </button>
      </div>
    </header>
  );
}

const TITLES: Record<string, string> = {
  '/': 'نظرة عامة',
  '/depts': 'الأقسام',
  '/tickets': 'التذاكر',
  '/sales': 'المبيعات',
  '/recruitment': 'التوظيف',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? (pathname.startsWith('/dept/') ? 'تفاصيل القسم' : 'لوحة الأداء');

  return (
    <div className="min-h-screen lg:ps-64">
      <Sidebar />
      <Header title={title} />
      {/* Bottom padding keeps the last row clear of the mobile nav and the FAB. */}
      <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-4 sm:px-6 lg:pb-12">{children}</main>
      <BottomNav />
    </div>
  );
}
