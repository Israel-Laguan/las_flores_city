'use client';

import styles from './BeatTable.module.css';
import { cn } from '@las-flores/ui';

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

export default function BeatTable({ beats, loading, editingSlug, editState, submitting, onEditStart, onEditSave, onEditCancel, onEditStateChange, onDelete }: BeatTableProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Story Beats</h2>
      {loading && beats.length === 0 ? (
        <p className={styles.muted}>Loading beats...</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Order</th>
              <th className={styles.th}>Slug</th>
              <th className={styles.th}>Label</th>
              <th className={styles.th}>Description</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {beats.map(beat => (
              <tr key={beat.slug}>
                {editingSlug === beat.slug ? (
                  <>
                    <td className={styles.td}>
                      <input aria-label="Order" type="number" value={editState.order} onChange={e => onEditStateChange(s => ({ ...s, order: e.target.value }))} min={0} className={cn(styles.input, styles.orderInput)} />
                    </td>
                    <td className={styles.td}><code className={styles.code}>{beat.slug}</code></td>
                    <td className={styles.td}>
                      <input aria-label="Label" type="text" value={editState.label} onChange={e => onEditStateChange(s => ({ ...s, label: e.target.value }))} className={styles.input} />
                    </td>
                    <td className={styles.td}>
                      <input aria-label="Description" type="text" value={editState.description} onChange={e => onEditStateChange(s => ({ ...s, description: e.target.value }))} className={styles.input} />
                    </td>
                    <td className={styles.td}>
                      <button onClick={() => onEditSave(beat.slug)} disabled={submitting} className={cn(styles.smallButton, styles.primaryButton)}>Save</button>
                      <button onClick={onEditCancel} disabled={submitting} className={cn(styles.smallButton, styles.secondaryButton)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className={styles.td}>{beat.order}</td>
                    <td className={styles.td}><code className={styles.code}>{beat.slug}</code></td>
                    <td className={styles.td}>{beat.label}</td>
                    <td className={styles.td}>{beat.description}</td>
                    <td className={styles.td}>
                      <button onClick={() => onEditStart(beat)} disabled={submitting} className={cn(styles.smallButton, styles.secondaryButton)}>Edit</button>
                      <button onClick={() => onDelete(beat.slug)} disabled={submitting} className={cn(styles.smallButton, styles.dangerButton)}>Delete</button>
                      <a href={`/story-beats/${beat.slug}`} className={styles.detailLink}>Detail</a>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!loading && beats.length === 0 && (
              <tr><td colSpan={5} className={cn(styles.td, styles.muted, styles.textCenter)}>No beats found. Add one above.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
