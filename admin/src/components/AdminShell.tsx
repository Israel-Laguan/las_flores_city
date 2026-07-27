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
    setCollapsed(prev => !prev);
  }, []);

  // Persist collapse preference after the state is committed (avoids React replay
  // writing to localStorage with a stale value).
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage unavailable — state still works for the session
    }
  }, [collapsed]);

  const toggleMobile = useCallback(() => setMobileOpen(open => !open), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <SidebarContext.Provider
      value={{ mobileOpen, toggleMobile, closeMobile, collapsed, toggleCollapsed }}
    >
      <div className={styles.shell} data-collapsed={collapsed ? 'true' : undefined}>
        <Sidebar />
        {mobileOpen && (
          <>
            {/* Focus trap: move focus into the sidebar on open; the sidebar
                contains the first focusable element (logo link) so Tab follows
                navigation items. The backdrop closes the drawer when clicked. */}
            <div
              className={styles.backdrop}
              role="presentation"
              aria-hidden="true"
              onClick={closeMobile}
            />
          </>
        )}
        <div
          className={styles.content}
          // On mobile when the drawer is open, mark content as inert so
          // keyboard focus stays within the navigation.
          {...(mobileOpen ? { inert: '' as unknown as boolean } : {})}
        >
          <TopBar user={user} />
          <Breadcrumbs />
          <div className={styles.main}>{children}</div>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
