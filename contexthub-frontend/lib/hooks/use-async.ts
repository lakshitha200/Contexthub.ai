"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Run an async loader on mount (and whenever `deps` change), exposing
 * loading/error/data plus manual reload and optimistic setData.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setDataState] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  // Keep the latest loader without forcing it into the dependency array.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await loaderRef.current();
      if (mounted.current) setDataState(result);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mounted.current = true;
    void run();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) =>
      typeof updater === "function" ? (updater as (p: T | undefined) => T)(prev) : updater,
    );
  }, []);

  return { data, loading, error, reload: run, setData };
}
