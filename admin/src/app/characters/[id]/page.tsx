'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/client-api';
import styles from './character-detail.module.css';

interface CharacterRecord {
  id: string;
  name: string;
  title?: string;
  description?: string;
  portraitUrls?: string[];
  portraitStatus?: string;
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
          setRecord(data.data ?? null);
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

  return (
    <main className={styles.main}>
      <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
      <h1>Character: {record?.name ?? id}</h1>
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
