"use client";

import { adminStyles as styles } from '@/lib/adminStyles';

interface StoryBeat { slug: string; label: string; order: number; description: string }
interface EditState { label: string; order: string; description: string }

interface BeatTableProps {
  beats: StoryBeat[];
  loading: boolean;
  editingSlug: string | null;
  editState: EditState;
  submitting: boolean;
  onEditStart: (beat: StoryBeat) => void;
  onEditSave: (slug: string) => void;
  onEditCancel: () => void;
  onEditStateChange: (updater: (s: EditState) => EditState) => void;
  onDelete: (slug: string) => void;
}

const inputStyle: React.CSSProperties = {
  backgroundColor: '#0d0d1a',
  border: '1px solid #00ff00',
  color: '#fff',
  fontFamily: 'monospace',
  padding: '0.25rem 0.5rem',
  borderRadius: '3px',
  width: '100%',
};

function smallButtonStyle(variant: 'primary' | 'danger' | 'secondary', submitting: boolean): React.CSSProperties {
  return {
    ...styles.button,
    padding: '0.25rem 0.75rem',
    fontSize: '0.85rem',
    marginRight: '0.25rem',
    ...(submitting ? styles.disabledButton : variant === 'primary' ? styles.primaryButton : variant === 'danger' ? styles.dangerButton : styles.secondaryButton),
  };
}

export default function BeatTable({ beats, loading, editingSlug, editState, submitting, onEditStart, onEditSave, onEditCancel, onEditStateChange, onDelete }: BeatTableProps) {
  return (
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
                      <input type="number" value={editState.order} onChange={e => onEditStateChange(s => ({ ...s, order: e.target.value }))} min={0} style={{ ...inputStyle, width: '70px' }} />
                    </td>
                    <td style={styles.td}><code style={{ color: '#aaa' }}>{beat.slug}</code></td>
                    <td style={styles.td}>
                      <input type="text" value={editState.label} onChange={e => onEditStateChange(s => ({ ...s, label: e.target.value }))} style={inputStyle} />
                    </td>
                    <td style={styles.td}>
                      <input type="text" value={editState.description} onChange={e => onEditStateChange(s => ({ ...s, description: e.target.value }))} style={inputStyle} />
                    </td>
                    <td style={styles.td}>
                      <button onClick={() => onEditSave(beat.slug)} disabled={submitting} style={smallButtonStyle('primary', submitting)}>Save</button>
                      <button onClick={onEditCancel} disabled={submitting} style={smallButtonStyle('secondary', submitting)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={styles.td}>{beat.order}</td>
                    <td style={styles.td}><code style={{ color: '#aaa' }}>{beat.slug}</code></td>
                    <td style={styles.td}>{beat.label}</td>
                    <td style={styles.td}>{beat.description}</td>
                    <td style={styles.td}>
                      <button onClick={() => onEditStart(beat)} disabled={submitting} style={smallButtonStyle('secondary', submitting)}>Edit</button>
                      <button onClick={() => onDelete(beat.slug)} disabled={submitting} style={smallButtonStyle('danger', submitting)}>Delete</button>
                      <a href={`/story-beats/${beat.slug}`} style={{ color: '#00ff00', fontFamily: 'monospace', fontSize: '0.85rem' }}>Detail</a>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!loading && beats.length === 0 && (
              <tr><td colSpan={5} style={{ ...styles.td, ...styles.muted, textAlign: 'center' }}>No beats found. Add one above.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
