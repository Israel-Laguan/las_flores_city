'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/client-api';
import Badge from '@/components/Badge';
import EntityDetailView from '@/components/entity/EntityDetailView';
import { CHARACTER_VIEW_FIELDS } from '../field-definitions';
import styles from './character-detail.module.css';

interface CharacterRecord {
  id: string;
  name: string;
  title?: string;
  description?: string;
  portrait_urls?: Array<Record<string, unknown>> | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export default function CharacterDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<CharacterRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const data = await adminFetch<{ success: boolean; data?: CharacterRecord; error?: string }>(
          `/admin/characters/${id}`,
        );
        if (data.success && data.data) {
          setRecord(data.data);
        } else {
          setError(data.error || 'Failed to fetch character');
        }
      } catch (err: any) {
        if (err?.status === 404) {
          setNotFound(true);
        } else {
          setError('Failed to fetch character');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchRecord();
  }, [id]);

  if (loading) {
    return (
      <main className={styles.main}>
        <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
        <p className={styles.muted}>Loading...</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className={styles.main}>
        <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
        <p>Not found.</p>
      </main>
    );
  }

  if (error || !record) {
    return (
      <main className={styles.main}>
        <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
        <div className={styles.errorBox}>{error || 'Character not found'}</div>
      </main>
    );
  }

  const hasPortraits = Array.isArray(record.portrait_urls) && record.portrait_urls.length > 0;
  const portraitStatus = hasPortraits ? 'ready' : 'missing';

  return (
    <main className={styles.main}>
      <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
      <div className={styles.header}>
        <h1 className={styles.title}>Character: {record.name}</h1>
        <div className={styles.headerActions}>
          <Badge variant={portraitStatus === 'ready' ? 'success' : 'warning'}>{portraitStatus}</Badge>
          <Link href={`/characters/${id}/edit`} className="btn btn--primary">Edit</Link>
        </div>
      </div>
      <EntityDetailView fields={CHARACTER_VIEW_FIELDS} record={record as unknown} />
    </main>
  );
}

