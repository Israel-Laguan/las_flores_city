'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from './SidebarContext';
import { getPageTitle } from './nav-config';
import type { AdminUser } from './AdminShell';
import styles from './TopBar.module.css';

interface TopBarProps {
  user: AdminUser | null;
}

export default function TopBar({ user }: TopBarProps) {
  const { mobileOpen, toggleMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const title = getPageTitle(pathname);

  const handleLogout = async () => {
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
