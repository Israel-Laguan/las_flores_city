"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminStyles as styles } from '@/lib/adminStyles';

interface Props {
  title: string;
  backHref: string;
  backLabel: string;
}

export default function ContentDetailPage({ title, backHref, backLabel }: Props) {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const res = await fetch(`/api/admin/${backHref.slice(1)}/${id}`);
        if (res.status === 404) {
          setNotFound(true);
        } else {
          const data = await res.json();
          if (data.success) {
            setRecord(data.data);
          } else {
            setError(data.error || `Failed to fetch ${title.toLowerCase()}`);
          }
        }
      } catch {
        setError(`Failed to fetch ${title.toLowerCase()}`);
      } finally {
        setLoading(false);
      }
    }
    fetchRecord();
  }, [id, backHref, title]);

  return (
    <main style={styles.main}>
      <Link href={backHref} style={{ color: '#00ff00' }}>← Back to {backLabel}</Link>
      <h1 style={styles.heading}>{title}: {id}</h1>
      {loading && <p style={styles.muted}>Loading...</p>}
      {!loading && notFound && <p>Not found.</p>}
      {!loading && !notFound && error && <div style={styles.errorBox}>{error}</div>}
      {!loading && !notFound && !error && record !== null && (
        <pre style={{ background: '#0d0d1a', border: '1px solid #333', padding: '1rem', borderRadius: '5px', overflowX: 'auto', color: '#aaa', fontSize: '0.85rem' }}>
          {JSON.stringify(record, null, 2)}
        </pre>
      )}
    </main>
  );
}
