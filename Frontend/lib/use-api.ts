"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

type LoadOptions = { silent?: boolean };

// Minimal data-fetching hook with loading/error/refetch. Pass a stable dep list
// (like a filter object serialized) to re-run when inputs change.
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const run = useCallback(fetcher, deps);

  const load = useCallback(async (options: LoadOptions = {}) => {
    if (!options.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setData(await run());
      if (!options.silent) setError(null);
    } catch (err) {
      if (!options.silent) {
        setError(err instanceof ApiError ? err.message : "Failed to load data");
      }
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, [run]);

  const refetch = useCallback(() => load(), [load]);
  const refresh = useCallback(() => load({ silent: true }), [load]);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  return { data, loading, error, refetch, refresh, setData };
}
