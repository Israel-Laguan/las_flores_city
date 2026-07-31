import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('themeEngine', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      },
      writable: true,
    });
    document.body.className = '';
    vi.resetModules();
  });

  it('defaults to dark when storage is empty', async () => {
    const { getStoredTheme } = await import('../themeEngine');
    expect(getStoredTheme()).toBe('dark');
  });

  it('persists toggled theme to localStorage', async () => {
    const { toggleTheme, getStoredTheme } = await import('../themeEngine');
    toggleTheme();
    expect(getStoredTheme()).toBe('light');
  });

  it('toggles from dark to light and back', async () => {
    const { toggleTheme } = await import('../themeEngine');
    expect(toggleTheme()).toBe('light');
    expect(document.body.classList.contains('theme-light')).toBe(true);
    expect(toggleTheme()).toBe('dark');
    expect(document.body.classList.contains('theme-light')).toBe(false);
  });

  it('persists mode via applyTheme', async () => {
    const { applyTheme, getStoredTheme } = await import('../themeEngine');
    applyTheme('light');
    expect(getStoredTheme()).toBe('light');
    expect(document.body.classList.contains('theme-light')).toBe(true);
    // applyTheme is idempotent — same mode doesn't change storage
    applyTheme('light');
    expect(getStoredTheme()).toBe('light');
  });

  it('persists direct dark selection via setTheme', async () => {
    const { setTheme, getStoredTheme } = await import('../themeEngine');
    setTheme('dark');
    expect(getStoredTheme()).toBe('dark');
    expect(document.body.classList.contains('theme-light')).toBe(false);
  });

  it('notifies subscribers on theme changes', async () => {
    const { applyTheme, subscribeTheme } = await import('../themeEngine');
    const listener = vi.fn();
    const unsub = subscribeTheme(listener);
    applyTheme('light');
    expect(listener).toHaveBeenCalledWith('light');
    unsub();
    listener.mockClear();
    applyTheme('light');
    expect(listener).not.toHaveBeenCalled();
  });
});
