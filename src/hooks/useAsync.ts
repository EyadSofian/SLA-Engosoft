import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** First load only — the one time it's correct to show skeletons. */
  loading: boolean;
  /** A refetch while data is already on screen. Dim it; never re-skeleton it. */
  refreshing: boolean;
  reload: () => void;
}

/**
 * Runs `fn` whenever `deps` change, keeping the previous result visible during
 * a refetch so the layout never jumps back to skeletons.
 *
 * `fn` is intentionally not part of the dependency list — callers pass inline
 * arrows, and `deps` is the explicit contract.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [pending, setPending] = useState(true);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Guards against a slow earlier request landing after a newer one.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const runId = ++runIdRef.current;
    setPending(true);

    fnRef.current().then(
      (result) => {
        if (!mountedRef.current || runId !== runIdRef.current) return;
        setData(result);
        setError(undefined);
        setPending(false);
      },
      (err: unknown) => {
        if (!mountedRef.current || runId !== runIdRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setPending(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const hasData = data !== undefined;
  return {
    data,
    error,
    loading: pending && !hasData,
    refreshing: pending && hasData,
    reload,
  };
}
