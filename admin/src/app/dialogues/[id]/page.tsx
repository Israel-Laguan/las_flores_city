'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/client-api';
import styles from './dialogue-detail.module.css';

interface DialogueRecord {
  id: string;
  name: string;
  description?: string;
  nodes?: unknown[];
  [key: string]: unknown;
}

export default function DialogueDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<DialogueRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const data = await adminFetch<{ success: boolean; data?: DialogueRecord; error?: string }>(
          `/admin/dialogues/${id}`,
        );
        if (data.success && data.data) {
          setRecord(data.data ?? null);
        } else {
          setError(data.error || 'Failed to fetch dialogue');
        }
      } catch (err: any) {
        if (err?.status === 404) {
          setNotFound(true);
        } else {
          setError('Failed to fetch dialogue');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchRecord();
  }, [id]);

  return (
    <main className={styles.main}>
      <Link href="/dialogues" className={styles.backLink}>&larr; Back to Dialogues</Link>
      <h1>Dialogue: {record?.name ?? id}</h1>
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
