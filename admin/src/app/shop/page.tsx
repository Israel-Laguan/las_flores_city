"use client";

import { useState, useEffect, useCallback } from 'react';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  itemType: string;
  price: number;
  currencyType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  button: { padding: '0.75rem 1.5rem', borderRadius: '5px', fontWeight: 'bold', fontFamily: 'monospace', cursor: 'pointer', border: 'none', fontSize: '1rem' },
  secondaryButton: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333' },
  badge: { padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' },
  successBadge: { backgroundColor: '#00ff00', color: '#000' },
  errorBadge: { backgroundColor: '#ff4444', color: '#fff' },
  infoBadge: { backgroundColor: '#0066ff', color: '#fff' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  muted: { color: '#888' },
};

export default function ShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/admin/shop?page=${p}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setTotal(data.data.total);
      } else {
        setError(data.error || 'Failed to fetch shop items');
      }
    } catch {
      setError('Failed to fetch shop items');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => { fetchPage(page); }, [page, fetchPage]);

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>🛒 Shop Items</h1>
      {error && <div style={styles.errorBox}>{error}</div>}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Shop Item List</h2>
        {loading && items.length === 0 ? (
          <p style={styles.muted}>Loading...</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Price</th>
                <th style={styles.th}>Currency</th>
                <th style={styles.th}>Active</th>
                <th style={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} onClick={() => { window.location.href = `/shop/${item.id}`; }} style={{ cursor: 'pointer' }}>
                  <td style={styles.td}>{item.name}</td>
                  <td style={styles.td}><span style={{ ...styles.badge, ...styles.infoBadge }}>{item.itemType}</span></td>
                  <td style={styles.td}>{item.price}</td>
                  <td style={styles.td}>{item.currencyType}</td>
                  <td style={styles.td}>
                    {item.isActive
                      ? <span style={{ ...styles.badge, ...styles.successBadge }}>Active</span>
                      : <span style={{ ...styles.badge, ...styles.errorBadge }}>Inactive</span>}
                  </td>
                  <td style={styles.td}>{new Date(item.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ ...styles.td, ...styles.muted, textAlign: 'center' }}>No shop items found.</td></tr>
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
