'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/client-api';
import { useBreadcrumbLabel } from '@/components/BreadcrumbContext';
import styles from './content-detail.module.css';

interface Props {
  title: string;
  backHref: string;
  backLabel: string;
  getBreadcrumbLabel?: (record: unknown) => string | null;
}

function defaultBreadcrumbLabel(record: unknown): string | null {
  if (record && typeof record === 'object') {
    const r = record as Record<string, unknown>;
    const name = r.name;
    const title = r.title;
    if (typeof name === 'string' && name.length > 0) return name;
    if (typeof title === 'string' && title.length > 0) return title;
  }
  return null;
}

export default function ContentDetailPage({ title, backHref, backLabel, getBreadcrumbLabel }: Props) {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const resolveLabel = getBreadcrumbLabel ?? defaultBreadcrumbLabel;
  const breadcrumbLabel = record ? resolveLabel(record) : null;
  useBreadcrumbLabel(id, breadcrumbLabel);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const data = await adminFetch<{ success: boolean; data?: unknown; error?: string }>(
          `/admin/${backHref.slice(1)}/${id}`,
        );
        if (data.success) {
          setRecord(data.data);
        } else {
          setError(data.error || `Failed to fetch ${title.toLowerCase()}`);
        }
      } catch (err: any) {
        if (err?.status === 404) {
          setNotFound(true);
        } else {
          setError(`Failed to fetch ${title.toLowerCase()}`);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchRecord();
  }, [id, backHref, title]);

  return (
    <main className={styles.main}>
      <Link href={backHref} className={styles.backLink}>&larr; Back to {backLabel}</Link>
      <h1>{title}: {id}</h1>
      {loading && <p className={styles.muted}>Loading...</p>}
      {!loading && notFound && <p>Not found.</p>}
      {!loading && !notFound && error && <div className={styles.errorBox}>{error}</div>}
      {!loading && !notFound && !error && record !== null && (
        <pre className={styles.json}>
          {JSON.stringify(record, null, 2)}
        </pre>
      )}
    </main>
  );
}
