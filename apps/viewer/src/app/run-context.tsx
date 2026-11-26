import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { RunModel } from "../loader/run-model.js";
import type { LoadError, Result } from "../loader/types.js";
import type { Route } from "../router/routes.js";
import { getHash, getServerHash, routeOfHash, subscribeHash } from "./use-hash-route.js";

export type RunContextValue = {
  run: RunModel | undefined;
  /** Sets the Run on success. A failed load leaves the previous Run in place. */
  applyLoad: (result: Result<RunModel, LoadError>) => void;
};

const RunContext = createContext<RunContextValue | undefined>(undefined);

/** Holds the current Run in memory only. Nothing is written to any browser storage. */
export function RunProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<RunModel | undefined>(undefined);
  const applyLoad = useCallback((result: Result<RunModel, LoadError>) => {
    if (result.ok) setRun(result.value);
  }, []);
  const value = useMemo(() => ({ run, applyLoad }), [run, applyLoad]);
  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun(): RunContextValue {
  const value = useContext(RunContext);
  if (value === undefined) throw new Error("useRun must be used inside a RunProvider");
  return value;
}

/** The current route, re-parsed from `location.hash` on every `hashchange`. */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash);
  return useMemo(() => routeOfHash(hash), [hash]);
}
