"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  button: {
    padding: '0.75rem 1.5rem',
    borderRadius: '5px',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    cursor: 'pointer',
    border: 'none',
    fontSize: '1rem',
  },
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
  secondaryButton: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  dangerButton: { backgroundColor: '#ff4444', color: '#000' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333' },
  badge: { padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' },
  successBadge: { backgroundColor: '#00ff00', color: '#000' },
  errorBadge: { backgroundColor: '#ff4444', color: '#fff' },
  warningBadge: { backgroundColor: '#ffaa00', color: '#000' },
  infoBadge: { backgroundColor: '#0066ff', color: '#fff' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' },
  summaryCard: { textAlign: 'center' as const, padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  summaryValue: { fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' },
  summaryLabel: { color: '#888', fontSize: '0.9rem' },
  muted: { color: '#888' },
  spinner: { display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid #00ff00', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '0.5rem' },
};

export default function DialogueDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const res = await fetch(`/api/admin/dialogues/${id}`);
        if (res.status === 404) {
          setNotFound(true);
        } else {
          const data = await res.json();
          if (data.success) {
            setRecord(data.data);
          } else {
            setError(data.error || 'Failed to fetch dialogue');
          }
        }
      } catch {
        setError('Failed to fetch dialogue');
      } finally {
        setLoading(false);
      }
    }
    fetchRecord();
  }, [id]);

  return (
    <main style={styles.main}>
      <a href="/dialogues" style={{ color: '#00ff00' }}>← Back to Dialogues</a>
      <h1 style={styles.heading}>Dialogue: {id}</h1>
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
