"use client";

import { useState, useEffect, useCallback } from 'react';

interface MysteryItem {
  id: string;
  title: string;
  description: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  button: { padding: '0.75rem 1.5rem', borderRadius: '5px', fontWeight: 'bold', fontFamily: 'monospace', cursor: 'pointer', border: 'none', fontSize: '1rem' },
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
  secondaryButton: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333' },
  badge: { padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' },
  activeBadge: { backgroundColor: '#00ff00', color: '#000' },
  resolvingBadge: { backgroundColor: '#ffaa00', color: '#000' },
  archivedBadge: { backgroundColor: '#888', color: '#fff' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  muted: { color: '#888' },
};

function StatusBadge({ status }: { status: string }) {
  const badgeStyle = status === 'ACTIVE' ? styles.activeBadge
    : status === 'RESOLVING' ? styles.resolvingBadge
    : styles.archivedBadge;
  return <span style={{ ...styles.badge, ...badgeStyle }}>{status}</span>;
}

export default function MysteriesPage() {
  const [items, setItems] = useState<MysteryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/admin/mysteries?page=${p}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setTotal(data.data.total);
      } else {
        setError(data.error || 'Failed to fetch mysteries');
      }
    } catch {
      setError('Failed to fetch mysteries');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => { fetchPage(page); }, [page, fetchPage]);

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>🔍 Mysteries</h1>
      {error && <div style={styles.errorBox}>{error}</div>}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Mystery List</h2>
        {loading && items.length === 0 ? (
          <p style={styles.muted}>Loading...</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Title</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Expires</th>
                <th style={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} onClick={() => { window.location.href = `/mysteries/${item.id}`; }} style={{ cursor: 'pointer' }}>
                  <td style={styles.td}>{item.title}</td>
                  <td style={styles.td}><StatusBadge status={item.status} /></td>
                  <td style={styles.td}>{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '—'}</td>
                  <td style={styles.td}>{new Date(item.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={4} style={{ ...styles.td, ...styles.muted, textAlign: 'center' }}>No mysteries found.</td></tr>
              )}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
            style={{ ...styles.button, ...(page === 1 ? styles.disabledButton : styles.secondaryButton) }}>← Prev</button>
          <span style={styles.muted}>Page {page} of {Math.ceil(total / pageSize) || 1}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / pageSize)}
            style={{ ...styles.button, ...(page >= Math.ceil(total / pageSize) ? styles.disabledButton : styles.secondaryButton) }}>Next →</button>
        </div>
      </div>
    </main>
  );
}
