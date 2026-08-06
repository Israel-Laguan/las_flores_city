'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSidebar } from './SidebarContext';
import { getPageTitle } from './nav-config';
import { restorePersistedTheme, subscribeTheme, toggleTheme } from '@/lib/themeEngine';
import { isDialogueDirty } from '@/hooks/useUnsafeNavigationGuard';
import { isEditorDirty } from '@/components/editor/useEditor';
import type { AdminUser } from './AdminShell';
import styles from './TopBar.module.css';

interface TopBarProps {
  user: AdminUser | null;
}

// eslint-disable-next-line max-lines-per-function
export default function TopBar({ user }: TopBarProps) {
  const { mobileOpen, toggleMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const title = getPageTitle(pathname);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const unsubscribe = subscribeTheme(setTheme);
    restorePersistedTheme();
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    if ((isDialogueDirty() || isEditorDirty()) && !window.confirm('You have unsaved changes. Leave anyway?')) {
      return;
    }
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={toggleMobile}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          {mobileOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>
      <h1 className={styles.pageTitle}>{title}</h1>
      <button
        type="button"
        className={styles.themeToggle}
        onClick={() => toggleTheme()}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      >
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>
      <div className={styles.userArea}>
        {user ? (
          <>
            <span className={styles.userName}>{user.username || user.email}</span>
            {user.role && <span className="badge badge--success">{user.role}</span>}
            <button
              type="button"
              onClick={handleLogout}
              className={`btn btn--danger ${styles.logoutBtn}`}
            >
              Logout
            </button>
          </>
        ) : (
          <Link href="/login" className={`btn btn--primary ${styles.logoutBtn}`}>
            Login
          </Link>
        )}
      </div>
    </header>
  );
}
