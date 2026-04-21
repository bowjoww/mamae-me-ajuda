"use client";

import { useCallback, useEffect, useState } from "react";

export type AsyncResourceStatus = "loading" | "error" | "ready";

export interface AsyncResourceState<T> {
  /** The resolved payload, or `null` while loading / on error. */
  data: T | null;
  /** The thrown error, or `null` when no error is active. */
  error: unknown;
  /** Coarse state machine for the UI to switch on. */
  status: AsyncResourceStatus;
  /** Manually trigger a re-fetch. Increments an internal key. */
  reload: () => void;
}

/**
 * Minimal async resource hook with explicit error state.
 *
 * Why this exists:
 *   - `fetchProfile()` / `fetchQuests()` / `fetchStudyPlan()` now THROW
 *     `GamificationError` on backend failure (silent mock fallback was
 *     removed). Pages were calling them with `.then(setState)` and had no
 *     `.catch`, so any 500 produced an unhandled rejection and an
 *     indefinite blank screen.
 *   - This hook captures errors, exposes a three-state union, and gives
 *     pages a `reload()` they can wire to a "Tentar de novo" button.
 *
 * The `loader` is called on mount and whenever `reload()` is invoked.
 * Callers should stabilize the loader with `useCallback` if they don't
 * want re-fetches on every render.
 */
export function useAsyncResource<T>(
  loader: () => Promise<T>
): AsyncResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<AsyncResourceStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");
    setError(null);

    loader()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(err);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // We re-run whenever reloadKey changes; loader identity is the
    // caller's responsibility (stabilize with useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return { data, error, status, reload };
}
