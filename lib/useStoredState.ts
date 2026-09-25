"use client";

import { useCallback, useSyncExternalStore } from "react";

// useState persisted in localStorage. Server render (and a browser without
// storage) uses the fallback, so there is no hydration mismatch.
//
// Snapshots are cached per raw string: useSyncExternalStore needs the same
// reference back while the stored value is unchanged, and JSON.parse would
// return a fresh array/object on every call.

const EVENT = "stored-state";
const cache = new Map<string, { raw: string | null; value: unknown }>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useStoredState<T>(
  key: string,
  fallback: T,
  // Reject stale or malformed stored values (e.g. from an older version)
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] {
  const getSnapshot = useCallback((): T => {
    const raw = readRaw(key);
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.value as T;
    let value: T = fallback;
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (isValid(parsed)) value = parsed;
      } catch {
        // keep fallback
      }
    }
    cache.set(key, { raw, value });
    return value;
    // fallback/isValid are expected to be stable (module constants)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);

  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable: keep an in-memory value for this tab
        cache.set(key, { raw: readRaw(key), value: next });
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, setValue];
}
