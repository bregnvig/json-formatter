import { effect, signal, WritableSignal } from '@angular/core';

/**
 * A signal backed by localStorage: starts from the stored value (if it passes `isValid`)
 * and writes every change back. Storage failures (private mode, blocked site data) are
 * ignored, so the preference simply lasts for the session. Call in an injection context.
 */
export const persistedSignal = <T>(
  key: string,
  fallback: T,
  isValid: (v: unknown) => v is T,
): WritableSignal<T> => {
  const storageKey = `pref.${key}`;
  let initial = fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) initial = parsed;
    }
  } catch {
    /* unavailable or corrupt: use the fallback */
  }
  const s = signal(initial);
  effect(() => {
    const v = s();
    try {
      localStorage.setItem(storageKey, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  });
  return s;
};

export const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T);

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
