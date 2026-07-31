'use client';

const STORAGE_KEY = 'lf-admin-theme';

type ThemeMode = 'dark' | 'light';

let currentMode: ThemeMode = 'dark';
const listeners = new Set<(mode: ThemeMode) => void>();

function notify(): void {
  listeners.forEach(fn => fn(currentMode));
}

function readStoredTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light') return 'light';
  } catch {
    // localStorage unavailable — keep default
  }
  return 'dark';
}

export function applyTheme(mode: ThemeMode): void {
  currentMode = mode;
  const body = document.body;
  if (mode === 'light') {
    body.classList.add('theme-light');
  } else {
    body.classList.remove('theme-light');
  }
  notify();
}

export function toggleTheme(): ThemeMode {
  const next = currentMode === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage unavailable — state still works for the session
  }
  return next;
}

export function getStoredTheme(): ThemeMode {
  return readStoredTheme();
}

export function subscribeTheme(fn: (mode: ThemeMode) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Restore persisted theme after mount (avoids hydration mismatch). */
export function restorePersistedTheme(): void {
  const stored = readStoredTheme();
  applyTheme(stored);
}
