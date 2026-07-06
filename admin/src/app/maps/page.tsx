"use client";

import { useState, useEffect, useCallback } from 'react';

interface MapTileItem {
  id: string;
  x: number;
  y: number;
  terrainType: string;
  rotation: number;
  isFlipped: boolean;
  districtName: string | null;
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
  infoBadge: { backgroundColor: '#0066ff', color: '#fff' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  muted: { color: '#888' },
};

export default function MapsPage() {
  const [items, setItems] = useState<MapTileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(async (p: number) => {
    try {
      const res = await fetch(`/api/admin/maps?page=${p}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data.items);
        setTotal(data.data.total);
      } else {
        setError(data.error || 'Failed to fetch map tiles');
      }
    } catch {
      setError('Failed to fetch map tiles');
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => { fetchPage(page); }, [page, fetchPage]);

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>🗺️ Map Tiles</h1>
      {error && <div style={styles.errorBox}>{error}</div>}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Map Tile List</h2>
        {loading && items.length === 0 ? (
          <p style={styles.muted}>Loading...</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>District</th>
                <th style={styles.th}>X</th>
                <th style={styles.th}>Y</th>
                <th style={styles.th}>Terrain</th>
                <th style={styles.th}>Rotation</th>
                <th style={styles.th}>Flipped</th>
                <th style={styles.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} onClick={() => { window.location.href = `/maps/${item.id}`; }} style={{ cursor: 'pointer' }}>
                  <td style={styles.td}>{item.districtName || '—'}</td>
                  <td style={styles.td}>{item.x}</td>
                  <td style={styles.td}>{item.y}</td>
                  <td style={styles.td}><span style={{ ...styles.badge, ...styles.infoBadge }}>{item.terrainType}</span></td>
                  <td style={styles.td}>{item.rotation}°</td>
                  <td style={styles.td}>{item.isFlipped ? 'Yes' : 'No'}</td>
                  <td style={styles.td}>{new Date(item.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ ...styles.td, ...styles.muted, textAlign: 'center' }}>No map tiles found.</td></tr>
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
