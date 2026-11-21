import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Load data from the API and reload it when `deps` change or `reload()` runs.
 *
 * Previous data stays visible while a reload is in flight, so tables don't
 * flash empty after every save. `setData` allows local, optimistic updates.
 */
export default function useApiData(load, deps = []) {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState({ requestKey: null, data: null, error: '' });
  const loadRef = useRef(load);
  const requestKey = JSON.stringify([deps, reloadCount]);

  useLayoutEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let active = true;
    loadRef.current()
      .then((data) => {
        if (active) setResult({ requestKey, data, error: '' });
      })
      .catch((error) => {
        if (active) setResult((previous) => ({ requestKey, data: previous.data, error: error.message }));
      });
    return () => {
      active = false;
    };
  }, [requestKey]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const setData = useCallback((updater) => {
    setResult((previous) => ({
      ...previous,
      data: typeof updater === 'function' ? updater(previous.data) : updater,
    }));
  }, []);

  return {
    data: result.data,
    error: result.error,
    loading: result.requestKey !== requestKey,
    reload,
    setData,
  };
}
