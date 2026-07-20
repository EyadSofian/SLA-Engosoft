import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { IconAlert, IconCheck, IconClose } from '../Icons';
import { cx } from './primitives';

type Tone = 'error' | 'success' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Tone = 'error') => {
      const id = nextId.current++;
      setToasts((list) => {
        // Never stack the same message twice — a failing poll would spam it.
        if (list.some((t) => t.message === message)) return list;
        return [...list, { id, message, tone }];
      });
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-2.5 rounded-2xl px-4 py-3 text-sm shadow-lift',
              t.tone === 'error' && 'bg-status-bad text-white',
              t.tone === 'success' && 'bg-status-ok text-white',
              t.tone === 'info' && 'bg-navy text-white',
            )}
          >
            {t.tone === 'success' ? (
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p className="flex-1 leading-relaxed">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="إغلاق التنبيه"
              className="-m-1 shrink-0 rounded-lg p-1 opacity-80 transition hover:opacity-100"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
