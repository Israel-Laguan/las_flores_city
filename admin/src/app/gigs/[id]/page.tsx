"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  muted: { color: '#888' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
};

export default function GigDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [record, setRecord] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const res = await fetch(`/api/admin/gigs/${id}`);
        if (res.status === 404) { setNotFound(true); } else {
          const data = await res.json();
          if (data.success) { setRecord(data.data); } else { setError(data.error || 'Failed to fetch gig'); }
        }
      } catch { setError('Failed to fetch gig'); } finally { setLoading(false); }
    }
    fetchRecord();
  }, [id]);

  return (
    <main style={styles.main}>
      <a href="/gigs" style={{ color: '#00ff00' }}>← Back to Gigs</a>
      <h1 style={styles.heading}>Gig: {id}</h1>
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
