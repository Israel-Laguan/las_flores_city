'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SubNav.module.css';

interface SubNavItem {
  href: string;
  label: string;
}

interface SubNavProps {
  items: SubNavItem[];
}

export default function SubNav({ items }: SubNavProps) {
  const pathname = usePathname();

  return (
    <nav className={styles.subNav} aria-label="Section navigation">
      <ul className={styles.subNavList}>
        {items.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <li key={item.href} className={styles.subNavItem}>
              <Link
                href={item.href}
                className={`${styles.subNavLink} ${active ? styles.subNavLinkActive : ''}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}