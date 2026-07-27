'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Breadcrumbs from './Breadcrumbs';
import { SidebarContext } from './SidebarContext';
import styles from './AdminShell.module.css';

const COLLAPSE_STORAGE_KEY = 'lf-admin-sidebar-collapsed';

export interface AdminUser {
  username?: string;
  email?: string;
  role?: string;
}

interface AdminShellProps {
  user: AdminUser | null;
  children: React.ReactNode;
}

export default function AdminShell({ user, children }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Restore the desktop collapse preference after mount (avoids hydration mismatch).
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true');
    } catch {
      // localStorage unavailable — keep default
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable — state still toggles for the session
      }
      return next;
    });
  }, []);

  const toggleMobile = useCallback(() => setMobileOpen(open => !open), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <SidebarContext.Provider
      value={{ mobileOpen, toggleMobile, closeMobile, collapsed, toggleCollapsed }}
    >
      <div className={styles.shell} data-collapsed={collapsed ? 'true' : undefined}>
        <Sidebar />
        {mobileOpen && (
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Close navigation"
            onClick={closeMobile}
          />
        )}
        <div className={styles.content}>
          <TopBar user={user} />
          <Breadcrumbs />
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
