import { useEffect } from 'react';
import { useToast } from '../components/ui/Toast';

/** Surfaces a section-level failure as a toast without hiding the section itself. */
export function useErrorToast(...errors: Array<Error | undefined>) {
  const toast = useToast();
  const key = errors.map((e) => e?.message ?? '').join('|');

  useEffect(() => {
    for (const e of errors) {
      if (e) toast(e.message, 'error');
    }
    // `key` collapses the error list into a stable primitive so a re-render
    // with the same failures doesn't re-fire the toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
