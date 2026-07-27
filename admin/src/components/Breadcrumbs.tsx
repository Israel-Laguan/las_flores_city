'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Breadcrumbs.module.css';

function getBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [];

  let accumulated = '';
  for (const part of parts) {
    accumulated += `/${part}`;
    const label = part
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    crumbs.push({ label, href: accumulated });
  }

  return crumbs;
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  if (crumbs.length <= 1) return null;

  return (
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
      <ol className={styles.crumbList}>
        {crumbs.map((crumb, i) => (
          <li key={crumb.href} className={styles.crumbItem}>
            {i > 0 && <span className={styles.crumbSeparator}>/</span>}
            {i < crumbs.length - 1 ? (
              <Link href={crumb.href} className={styles.crumbLink}>{crumb.label}</Link>
            ) : (
              <span className={styles.crumbCurrent}>{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}