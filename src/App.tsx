import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AppShell } from './components/layout/AppShell';
import { ChatFab } from './components/chat/ChatFab';
import { ToastProvider } from './components/ui/Toast';
import { RefreshProvider } from './hooks/useRefresh';
import { isConfigured } from './lib/supabase';
import { IconAlert } from './components/Icons';
import Overview from './pages/Overview';
import Departments from './pages/Departments';
import DeptDetail from './pages/DeptDetail';
import Tickets from './pages/Tickets';
import Sales from './pages/Sales';
import Recruitment from './pages/Recruitment';

/** Shown when the build has no Supabase credentials — otherwise every card
 *  would just render the same connection error. */
function SetupNeeded() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="card max-w-md p-6 text-center">
        <IconAlert className="mx-auto h-9 w-9 text-status-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-navy">إعدادات الاتصال ناقصة</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          اللوحة محتاجة متغيّرات البيئة دي عشان تقرا من Supabase:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-100 p-3 text-start text-xs text-navy" dir="ltr">
VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_ANON_KEY
        </pre>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          حطّهم في متغيّرات البيئة عند مزوّد الاستضافة، وبعدها اعمل build تاني. استخدم مفتاح
          <span className="font-semibold"> publishable </span>
          بس — مش الـ secret.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />;

  return (
    <RefreshProvider>
      <ToastProvider>
        <MotionConfig reducedMotion="user">
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppShell>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/depts" element={<Departments />} />
                <Route path="/dept/:team" element={<DeptDetail />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/recruitment" element={<Recruitment />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
            <ChatFab />
          </BrowserRouter>
        </MotionConfig>
      </ToastProvider>
    </RefreshProvider>
  );
}
