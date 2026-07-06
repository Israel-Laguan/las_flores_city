"use client";

import { useState, useEffect, useCallback } from 'react';

interface StoryBeat {
  slug: string;
  label: string;
  order: number;
  description: string;
}

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

interface EditState {
  label: string;
  order: string;
  description: string;
}

// eslint-disable-next-line max-lines-per-function
export default function StoryBeatsPage() {
  const [beats, setBeats] = useState<StoryBeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ label: '', order: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  // Add form state
  const [formSlug, setFormSlug] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formOrder, setFormOrder] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const fetchBeats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/story-beats');
      const data = await res.json();
      if (data.success) {
        setBeats(data.data);
      } else {
        setError(data.error || 'Failed to fetch beats');
      }
    } catch {
      setError('Failed to fetch story beats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBeats();
  }, [fetchBeats]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/story-beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: formSlug,
          label: formLabel,
          order: Number(formOrder),
          description: formDescription,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFormSlug('');
        setFormLabel('');
        setFormOrder('');
        setFormDescription('');
        await fetchBeats();
      } else {
        setError(data.error || 'Failed to create beat');
      }
    } catch {
      setError('Failed to create beat');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditStart = (beat: StoryBeat) => {
    setEditingSlug(beat.slug);
    setEditState({
      label: beat.label ?? '',
      order: beat.order != null ? String(beat.order) : '',
      description: beat.description ?? '',
    });
  };

  const handleEditSave = async (slug: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/story-beats/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: editState.label,
          order: Number(editState.order),
          description: editState.description,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingSlug(null);
        await fetchBeats();
      } else {
        setError(data.error || 'Failed to update beat');
      }
    } catch {
      setError('Failed to update beat');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!window.confirm(`Delete beat "${slug}"? This cannot be undone.`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/story-beats/${slug}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchBeats();
      } else {
        setError(data.error || 'Failed to delete beat');
      }
    } catch {
      setError('Failed to delete beat');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#0d0d1a',
    border: '1px solid #00ff00',
    color: '#fff',
    fontFamily: 'monospace',
    padding: '0.25rem 0.5rem',
    borderRadius: '3px',
    width: '100%',
  };

  const smallButtonStyle = (variant: 'primary' | 'danger' | 'secondary'): React.CSSProperties => ({
    ...styles.button,
    padding: '0.25rem 0.75rem',
    fontSize: '0.85rem',
    marginRight: '0.25rem',
    ...(submitting ? styles.disabledButton : variant === 'primary' ? styles.primaryButton : variant === 'danger' ? styles.dangerButton : styles.secondaryButton),
  });

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>📖 Beat Registry</h1>

      {/* Add Beat Form */}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Add New Beat</h2>
        <form onSubmit={handleAddSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 2fr auto', gap: '0.75rem', alignItems: 'end' }}>
            <div>
              <label style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Slug</label>
              <input
                type="text"
                value={formSlug}
                onChange={e => setFormSlug(e.target.value)}
                required
                placeholder="e.g. act_1_intro"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Label</label>
              <input
                type="text"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                required
                placeholder="Human-readable label"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Order</label>
              <input
                type="number"
                value={formOrder}
                onChange={e => setFormOrder(e.target.value)}
                required
                min={0}
                placeholder="0"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Description</label>
              <input
                type="text"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                required
                placeholder="Short description"
                style={inputStyle}
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...styles.button,
                  ...(submitting ? styles.disabledButton : styles.primaryButton),
                }}
              >
                {submitting ? '⏳' : '+ Add Beat'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Error Display */}
      {error && (
        <div style={styles.errorBox}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</pre>
        </div>
      )}

      {/* Beats Table */}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Story Beats</h2>

        {loading && beats.length === 0 ? (
          <p style={styles.muted}>Loading beats...</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Order</th>
                <th style={styles.th}>Slug</th>
                <th style={styles.th}>Label</th>
                <th style={styles.th}>Description</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {beats.map(beat => (
                <tr key={beat.slug}>
                  {editingSlug === beat.slug ? (
                    <>
                      <td style={styles.td}>
                        <input
                          type="number"
                          value={editState.order}
                          onChange={e => setEditState(s => ({ ...s, order: e.target.value }))}
                          min={0}
                          style={{ ...inputStyle, width: '70px' }}
                        />
                      </td>
                      <td style={styles.td}>
                        <code style={{ color: '#aaa' }}>{beat.slug}</code>
                      </td>
                      <td style={styles.td}>
                        <input
                          type="text"
                          value={editState.label}
                          onChange={e => setEditState(s => ({ ...s, label: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={styles.td}>
                        <input
                          type="text"
                          value={editState.description}
                          onChange={e => setEditState(s => ({ ...s, description: e.target.value }))}
                          style={inputStyle}
                        />
                      </td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleEditSave(beat.slug)}
                          disabled={submitting}
                          style={smallButtonStyle('primary')}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingSlug(null)}
                          disabled={submitting}
                          style={smallButtonStyle('secondary')}
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={styles.td}>{beat.order}</td>
                      <td style={styles.td}>
                        <code style={{ color: '#aaa' }}>{beat.slug}</code>
                      </td>
                      <td style={styles.td}>{beat.label}</td>
                      <td style={styles.td}>{beat.description}</td>
                      <td style={styles.td}>
                        <button
                          onClick={() => handleEditStart(beat)}
                          disabled={submitting}
                          style={smallButtonStyle('secondary')}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(beat.slug)}
                          disabled={submitting}
                          style={smallButtonStyle('danger')}
                        >
                          Delete
                        </button>
                        <a
                          href={`/story-beats/${beat.slug}`}
                          style={{ color: '#00ff00', fontFamily: 'monospace', fontSize: '0.85rem' }}
                        >
                          Detail
                        </a>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {!loading && beats.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, ...styles.muted, textAlign: 'center' }}>
                    No beats found. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
