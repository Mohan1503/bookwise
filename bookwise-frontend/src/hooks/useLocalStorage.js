import { useCallback, useEffect, useState } from 'react';

/**
 * Small wrapper around `localStorage` that keeps React state in sync.
 *
 * - Reads lazily on first render.
 * - Falls back to `initialValue` when the key is missing, unreadable, or
 *   contains malformed JSON.
 * - Writes back on every change, ignoring quota/privacy-mode errors.
 */
export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === 'undefined') return initialValue;

    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      return JSON.parse(item);
    } catch {
      // Corrupted or inaccessible storage — fall back to the default value.
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value) => {
      setStoredValue((currentValue) => {
        const nextValue =
          typeof value === 'function' ? value(currentValue) : value;

        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          // Storage unavailable (private mode, quota exceeded) — keep state in memory.
        }

        return nextValue;
      });
    },
    [key],
  );

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore — nothing else to do if storage is unavailable.
    }
    setStoredValue(initialValue);
  }, [key, initialValue]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    function handleStorageChange(event) {
      if (event.key !== key) return;
      try {
        setStoredValue(
          event.newValue === null ? initialValue : JSON.parse(event.newValue),
        );
      } catch {
        setStoredValue(initialValue);
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}

export default useLocalStorage;
