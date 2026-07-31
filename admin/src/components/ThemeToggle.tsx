'use client';

import { useState, useEffect, useCallback } from 'react';
import { applyTheme, getStoredTheme, subscribeTheme, toggleTheme } from '@/lib/themeEngine';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle() {
  const [mode, setMode] = useState<'dark' | 'light'>(getStoredTheme);

  useEffect(() => {
    return subscribeTheme(setMode);
  }, []);

  const handleToggle = useCallback(() => {
    toggleTheme();
  }, []);

  return (
    <div className={styles.toggle}>
      <button
        type="button"
        className={`${styles.button} ${mode === 'dark' ? styles.active : ''}`}
        onClick={() => applyTheme('dark')}
        aria-pressed={mode === 'dark'}
      >
        Dark
      </button>
      <button
        type="button"
        className={`${styles.button} ${mode === 'light' ? styles.active : ''}`}
        onClick={handleToggle}
        aria-pressed={mode === 'light'}
      >
        Light
      </button>
    </div>
  );
}
