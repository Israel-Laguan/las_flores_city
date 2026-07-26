'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

interface NavItem {
  href: string;
  label: string;
  subItems?: Array<{ href: string; label: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Content',
    items: [
      { href: '/characters', label: 'Characters' },
      { href: '/dialogues', label: 'Dialogues' },
      { href: '/scenes', label: 'Scenes' },
      { href: '/story-beats', label: 'Story Beats', subItems: [
        { href: '/story-beats', label: 'All Beats' },
        { href: '/story-beats/new', label: 'New Beat' },
      ]},
      { href: '/story-arc', label: 'Story Arc' },
      { href: '/missions', label: 'Missions', subItems: [
        { href: '/missions', label: 'All Missions' },
        { href: '/missions/new', label: 'New Mission' },
      ]},
      { href: '/stories', label: 'Stories' },
      { href: '/overlays', label: 'Overlays' },
      { href: '/locations', label: 'Locations' },
      { href: '/vault', label: 'Vault' },
      { href: '/gigs', label: 'Gigs' },
      { href: '/shop', label: 'Shop' },
      { href: '/maps', label: 'Maps' },
      { href: '/lore', label: 'Lore' },
      { href: '/mysteries', label: 'Mysteries' },
    ],
  },
  {
    title: 'Creation',
    items: [
      { href: '/story-builder', label: 'Story Builder' },
      { href: '/story-builder/plans', label: 'Plans' },
      { href: '/editor', label: 'YAML Editor' },
      { href: '/content-linker', label: 'Content Linker' },
      { href: '/assets', label: 'Asset Generation' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/migration', label: 'Migration' },
      { href: '/validation', label: 'Validation' },
      { href: '/quality', label: 'Quality Dashboard' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/asset-coverage', label: 'Asset Coverage' },
      { href: '/asset-promotion', label: 'Asset Promotion' },
      { href: '/diff', label: 'Diff' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/users', label: 'Users' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

function NavItemLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const subItems = item.subItems;
  const hasSubItems = subItems && subItems.length > 0;
  const subActive = subItems ? subItems.some(sub => isActive(pathname, sub.href)) : false;

  return (
    <div className={styles.navItem}>
      <Link
        href={item.href}
        className={`${styles.navLink} ${active ? styles.navLinkActive : ''} ${subActive ? styles.navLinkSubActive : ''}`}
      >
        {item.label}
      </Link>
      {hasSubItems && subItems && (
        <div className={`${styles.subNav} ${subActive ? styles.subNavOpen : ''}`}>
          {subItems.map(sub => (
            <Link
              key={sub.href}
              href={sub.href}
              className={`${styles.subNavLink} ${isActive(pathname, sub.href) ? styles.subNavLinkActive : ''}`}
            >
              {sub.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NavSection({ section, pathname }: { section: NavSection; pathname: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const _hasActive = section.items.some(item => isActive(pathname, item.href) || (item.subItems && item.subItems.some(sub => isActive(pathname, sub.href))));

  return (
    <div className={styles.navSection}>
      <button
        className={styles.sectionHeader}
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <span className={styles.sectionTitle}>{section.title}</span>
        <span className={`${styles.sectionToggle} ${collapsed ? styles.sectionToggleCollapsed : ''}`}>
          ▾
        </span>
      </button>
      {!collapsed && (
        <div className={styles.sectionBody}>
          {section.items.map(item => (
            <NavItemLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  user?: { username?: string; email?: string; role?: string } | null;
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [mobileCollapsed, setMobileCollapsed] = useState(true);

  return (
    <>
      <button
        className={styles.mobileToggle}
        onClick={() => setMobileCollapsed(!mobileCollapsed)}
        aria-label="Toggle navigation"
      >
        {mobileCollapsed ? '☰' : '✕'}
      </button>
      <aside className={`${styles.sidebar} ${mobileCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.sidebarHeader}>
          <Link href="/" className={styles.logo}>Las Flores 2077</Link>
        </div>
        <nav className={styles.nav}>
          {navSections.map(section => (
            <NavSection key={section.title} section={section} pathname={pathname} />
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          {user ? (
            <div className={styles.userArea}>
              <span className={styles.userName}>{user.username || user.email}</span>
              <span className="badge badge--success">{user.role}</span>
              <Link href="/api/auth/logout" className={`btn btn--danger ${styles.logoutBtn}`}>LOGOUT</Link>
            </div>
          ) : (
            <Link href="/login" className={`btn btn--danger ${styles.loginBtn}`}>LOGIN</Link>
          )}
        </div>
      </aside>
    </>
  );
}