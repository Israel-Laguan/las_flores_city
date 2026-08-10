'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/client-api';
import { useBreadcrumbLabel } from '@/components/BreadcrumbContext';
import EntityDetailView from '@/components/entity/EntityDetailView';
import { LOCATION_VIEW_FIELDS } from '../field-definitions';
import styles from './page.module.css';

interface LocationRecord {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export default function LocationDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<LocationRecord | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset state for the new route — clears stale breadcrumb label
    setRecord(null);
    setLoading(true);
    setError(null);
    setNotFound(false);

    async function fetchRecord() {
      try {
        const data = await adminFetch<{ success: boolean; data?: LocationRecord; error?: string }>(
          `/admin/locations/${id}`,
        );
        if (cancelled) return;
        if (data.success && data.data) {
          setRecord(data.data);
          setLoadedId(id);
        } else {
          setError(data.error || 'Failed to fetch location');
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.status === 404) {
          setNotFound(true);
        } else {
          setError('Failed to fetch location');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRecord();
    return () => { cancelled = true; };
  }, [id]);

  useBreadcrumbLabel(id, loadedId === id ? record?.name ?? null : null);

  if (loading || loadedId !== id) {
    return (
      <div className={styles.main}>
        <Link href="/locations" className={styles.backLink}>&larr; Back to Locations</Link>
        <p className={styles.muted}>Loading...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className={styles.main}>
        <Link href="/locations" className={styles.backLink}>&larr; Back to Locations</Link>
        <p>Not found.</p>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className={styles.main}>
        <Link href="/locations" className={styles.backLink}>&larr; Back to Locations</Link>
        <div className={styles.errorBox}>{error || 'Location not found'}</div>
      </div>
    );
  }

  // Locations are `scenes` rows whose location-specific fields (district, tags,
  // aliases, history, map, etc.) live inside the `metadata` JSONB column
  // (migrated from YAML via `metadata: { ...data, type: 'location' }`). Flatten
  // metadata onto the record so EntityDetailView can read fields by their flat
  // canonical key (e.g. `district`, `tags`, `map.spawn.x`).
  const metadata =
    record.metadata && typeof record.metadata === 'object'
      ? (record.metadata as Record<string, unknown>)
      : {};
  const flattened = { ...record, ...metadata } as Record<string, unknown>;

  return (
    <div className={styles.main}>
      <Link href="/locations" className={styles.backLink}>&larr; Back to Locations</Link>
      <div className={styles.header}>
        <h1 className={styles.title}>Location: {record.name}</h1>
        <div className={styles.headerActions}>
          <Link href={`/locations/${id}/edit`} className="btn btn--primary">Edit</Link>
        </div>
      </div>
      <EntityDetailView fields={LOCATION_VIEW_FIELDS} record={flattened} />
    </div>
  );
}
