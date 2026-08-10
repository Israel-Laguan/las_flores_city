'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBreadcrumbLabels } from './BreadcrumbContext';
import styles from './Breadcrumbs.module.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function humanize(part: string): string {
  return part
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function resolveLabel(part: string, labels: Record<string, string>): string {
  if (labels[part]) return labels[part];
  if (UUID_RE.test(part)) return part; // raw UUID verbatim until a label is registered
  return humanize(part);
}

function getBreadcrumbs(
  pathname: string,
  labels: Record<string, string>,
): Array<{ label: string; href: string }> {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [];

  let accumulated = '';
  for (const part of parts) {
    accumulated += `/${part}`;
    crumbs.push({ label: resolveLabel(part, labels), href: accumulated });
  }

  return crumbs;
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const labels = useBreadcrumbLabels();
  const crumbs = getBreadcrumbs(pathname, labels);

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