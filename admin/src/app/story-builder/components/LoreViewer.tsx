'use client';

import { useState, useEffect } from 'react';

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #00ff00',
    borderRadius: '5px',
    padding: '1.5rem',
    maxWidth: '800px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    borderBottom: '1px solid #333',
    paddingBottom: '0.5rem',
  },
  title: {
    color: '#00ff00',
    fontSize: '1.1rem',
    fontWeight: 'bold' as const,
    margin: 0,
  },
  closeButton: {
    background: 'transparent',
    color: '#00ff00',
    border: '1px solid #00ff00',
    borderRadius: '3px',
    padding: '0.3rem 0.6rem',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    backgroundColor: '#0d0d1a',
    padding: '1rem',
    borderRadius: '5px',
    border: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
    lineHeight: '1.6',
    color: '#fff',
    whiteSpace: 'pre-wrap' as const,
  },
  path: {
    color: '#888',
    fontSize: '0.8rem',
    marginBottom: '0.5rem',
    fontFamily: 'monospace',
  },
  errorBox: {
    background: '#ff000033',
    border: '1px solid #ff4444',
    padding: '0.75rem',
    borderRadius: '5px',
    color: '#ff6666',
    fontSize: '0.85rem',
  },
  button: {
    padding: '0.4rem 0.8rem',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    cursor: 'pointer',
    border: 'none',
    marginRight: '0.5rem',
  },
  primaryButton: {
    backgroundColor: '#00ff00',
    color: '#000',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    color: '#00ff00',
    border: '1px solid #00ff00',
  },
};

interface LoreViewerProps {
  lorePath: string | null;
  onClose: () => void;
}

function LoreEditor({ content, onChange, onSave, onCancel }: {
  content: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void;
}) {
  return (
    <>
      <textarea
        style={{ flex: 1, width: '100%', backgroundColor: '#0d0d1a', color: '#00ff00', border: '1px solid #333', padding: '1rem', fontFamily: 'monospace', fontSize: '0.9rem', resize: 'none', marginBottom: '1rem', boxSizing: 'border-box' as const }}
        value={content} onChange={(e) => onChange(e.target.value)} autoFocus
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onSave}>Save</button>
        <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

export default function LoreViewer({ lorePath, onClose }: LoreViewerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!lorePath) return;
    setLoading(true); setError(null); setEditing(false);
    fetch(`/api/admin/lore/file?path=${encodeURIComponent(lorePath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) { setContent(data.data.content); setExists(data.data.exists ?? true); }
        else { setError(data.error || 'Failed to load lore'); }
      })
      .catch(() => setError('Failed to load lore'))
      .finally(() => setLoading(false));
  }, [lorePath]);

  function handleSave() {
    if (!lorePath) return;
    fetch('/api/admin/lore/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: lorePath, content }) })
      .then((res) => res.json())
      .then((data) => { if (data.success) { setEditing(false); setExists(true); } else { setError(data.error || 'Failed to save'); } })
      .catch(() => setError('Failed to save'));
  }

  if (!lorePath) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>Lore</h3>
            <div style={styles.path}>{lorePath}</div>
          </div>
          <button style={styles.closeButton} onClick={onClose}>Close</button>
        </div>
        {error && <div style={styles.errorBox}>{error}</div>}
        {!exists && !loading && !error && (
          <div style={{ marginBottom: '1rem', color: '#888', fontSize: '0.85rem' }}>This lore file doesn&apos;t exist yet.</div>
        )}
        {editing ? (
          <LoreEditor content={content} onChange={setContent} onSave={handleSave} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div style={styles.content}>{loading ? 'Loading...' : content || 'No content'}</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => setEditing(true)}>
                {exists ? 'Edit Lore' : 'Create Lore'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
