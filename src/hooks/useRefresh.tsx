import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface RefreshValue {
  /** Include in a `useAsync` dep list to re-run on a global refresh. */
  tick: number;
  refresh: () => void;
}

const RefreshContext = createContext<RefreshValue>({ tick: 0, refresh: () => {} });

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const value = useMemo(() => ({ tick, refresh }), [tick, refresh]);

  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh(): RefreshValue {
  return useContext(RefreshContext);
}
