'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  navSections,
  isActive,
  isItemActive,
  type NavItem,
  type NavSection as NavSectionType,
} from './nav-config';
import { NavIcon } from './navIcons';
import { useSidebar } from './SidebarContext';
import styles from './Sidebar.module.css';

function NavItemLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { closeMobile } = useSidebar();
  const subItems = item.subItems ?? [];
  const hasSubItems = subItems.length > 0;
  const itemActive = isItemActive(pathname, item);
  const subActive = subItems.some(sub => isActive(pathname, sub.href));
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? subActive;
  const subNavId = `subnav-${item.href.replace(/\//g, '-')}`;

  return (
    <div className={styles.navItem}>
      <div className={styles.navRow}>
        <Link
          href={item.href}
          className={`${styles.navLink} ${itemActive ? styles.navLinkActive : ''}`}
          aria-current={!hasSubItems && itemActive ? 'page' : undefined}
          title={item.label}
          onClick={closeMobile}
        >
          <NavIcon name={item.icon} className={styles.navIcon} />
          <span className={styles.navLabel}>{item.label}</span>
        </Link>
        {hasSubItems && (
          <button
            type="button"
            className={styles.expandToggle}
            aria-expanded={expanded}
            aria-controls={subNavId}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label}`}
            onClick={() => setManualExpanded(!expanded)}
          >
            <span
              className={`${styles.expandChevron} ${expanded ? styles.expandChevronOpen : ''}`}
            >
              ▾
            </span>
          </button>
        )}
      </div>
      {hasSubItems && expanded && (
        <div className={styles.subNav} id={subNavId}>
          {subItems.map(sub => (
            <Link
              key={sub.href}
              href={sub.href}
              className={`${styles.subNavLink} ${isActive(pathname, sub.href) ? styles.subNavLinkActive : ''}`}
              aria-current={isActive(pathname, sub.href) ? 'page' : undefined}
              onClick={closeMobile}
            >
              <span className={styles.navLabel}>{sub.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NavSection({ section, pathname }: { section: NavSectionType; pathname: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const { collapsed: railCollapsed } = useSidebar();
  // In icon-rail mode section collapsing makes no sense — always show the icons.
  const effectiveCollapsed = collapsed && !railCollapsed;

  return (
    <div className={styles.navSection}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!effectiveCollapsed}
      >
        <span className={styles.sectionTitle}>{section.title}</span>
        <span
          className={`${styles.sectionToggle} ${effectiveCollapsed ? styles.sectionToggleCollapsed : ''}`}
        >
          ▾
        </span>
      </button>
      {!effectiveCollapsed && (
        <div className={styles.sectionBody}>
          {section.items.map(item => (
            <NavItemLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { mobileOpen, collapsed, toggleCollapsed } = useSidebar();

  return (
    <aside
      className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}
      aria-label="Primary navigation"
    >
      <div className={styles.sidebarHeader}>
        <Link href="/" className={styles.logo} title="Las Flores 2077 — Dashboard">
          <span className={styles.logoFull}>Las Flores 2077</span>
          <span className={styles.logoShort}>LF</span>
        </Link>
      </div>
      <nav className={styles.nav}>
        {navSections.map(section => (
          <NavSection key={section.title} section={section} pathname={pathname} />
        ))}
      </nav>
      <div className={styles.sidebarFooter}>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span
            className={`${styles.collapseChevron} ${collapsed ? styles.collapseChevronCollapsed : ''}`}
          >
            «
          </span>
          <span className={styles.navLabel}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
