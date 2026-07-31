'use client';

import { useState, useEffect } from 'react';
import { getStoredTheme, setTheme, subscribeTheme } from '@/lib/themeEngine';
import styles from './ThemeToggle.module.css';

export default function ThemeToggle() {
  const [mode, setMode] = useState<'dark' | 'light'>(getStoredTheme);

  useEffect(() => {
    return subscribeTheme(setMode);
  }, []);

  return (
    <div className={styles.toggle}>
      <button
        type="button"
        className={`${styles.button} ${mode === 'dark' ? styles.active : ''}`}
        onClick={() => setTheme('dark')}
        aria-pressed={mode === 'dark'}
      >
        Dark
      </button>
      <button
        type="button"
        className={`${styles.button} ${mode === 'light' ? styles.active : ''}`}
        onClick={() => setTheme('light')}
        aria-pressed={mode === 'light'}
      >
        Light
      </button>
    </div>
  );
}
