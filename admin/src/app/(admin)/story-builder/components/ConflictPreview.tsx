'use client';

import { cn } from '@las-flores/ui';
import type { IntakeConflictPreview } from '@las-flores/shared';
import styles from './ConflictPreview.module.css';

interface ConflictPreviewProps {
  conflicts: IntakeConflictPreview[];
  fileConflicts: string[];
  hasPlanId: boolean;
  loading: boolean;
  onGenerateFullPlan: () => void;
  onRefineInstead: () => void;
}

const SEVERITY_LABEL: Record<string, string> = {
  error: 'Blocking',
  warning: 'Warning',
};

function ConflictItem({ conflict }: { conflict: IntakeConflictPreview }) {
  return (
    <li className={styles.item}>
      <span className={cn(styles.badge, conflict.severity === 'error' ? styles.badgeError : styles.badgeWarning)}>
        {SEVERITY_LABEL[conflict.severity] ?? conflict.severity}
      </span>
      <span className={styles.type}>{conflict.type.replace(/_/g, ' ')}</span>
      <span className={styles.desc}>{conflict.description}</span>
      {conflict.relatedItems.length > 0 && (
        <span className={styles.related}>in: {conflict.relatedItems.join(', ')}</span>
      )}
    </li>
  );
}

/**
 * Phase-1 intake conflict preview. Shown at the top of ReviewStep before the plan is
 * committed. Both the LLM conflict scan and the advisory file-collision check are
 * surfaced here. The author must explicitly commit via "Generate Full Plan".
 */
export default function ConflictPreview({
  conflicts,
  fileConflicts,
  hasPlanId,
  loading,
  onGenerateFullPlan,
  onRefineInstead,
}: ConflictPreviewProps) {
  const total = conflicts.length + fileConflicts.length;

  if (hasPlanId) {
    // Post-scaffold: the author already committed; conflicts are informational only.
    if (total === 0) return null;
    return (
      <div className={styles.section}>
        <h3 className={styles.heading}>
          ⚠️ {total} potential conflict{total === 1 ? '' : 's'} detected
        </h3>
        {conflicts.length > 0 && (
          <ul className={styles.list}>{conflicts.map((c, i) => <ConflictItem key={i} conflict={c} />)}</ul>
        )}
        {fileConflicts.length > 0 && (
          <ul className={styles.list}>
            {fileConflicts.map((f, i) => (
              <li key={i} className={styles.item}>
                <span className={cn(styles.badge, styles.badgeWarning)}>File</span>
                <span className={styles.desc}>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Pre-scaffold: this is the phase-1 preview. Allow commit or refine.
  return (
    <div className={styles.section}>
      <h3 className={styles.heading}>
        {total === 0
          ? '✓ No potential conflicts detected'
          : `⚠️ ${total} potential conflict${total === 1 ? '' : 's'} detected`}
      </h3>
      {total > 0 && (
        <p className={styles.hint}>
          The outline is a preview only — nothing has been written to disk or the database yet.
          Review these flags, then commit with &ldquo;Generate Full Plan&rdquo; or refine first.
        </p>
      )}
      {conflicts.length > 0 && (
        <ul className={styles.list}>{conflicts.map((c, i) => <ConflictItem key={i} conflict={c} />)}</ul>
      )}
      {fileConflicts.length > 0 && (
        <ul className={styles.list}>
          {fileConflicts.map((f, i) => (
            <li key={i} className={styles.item}>
              <span className={cn(styles.badge, styles.badgeWarning)}>File</span>
              <span className={styles.desc}>{f}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button
          className={cn(styles.button, styles.primaryButton, loading && styles.disabledButton)}
          onClick={onGenerateFullPlan}
          disabled={loading}
        >
          {loading ? 'Committing…' : 'Generate Full Plan ↑'}
        </button>
        <button
          className={cn(styles.button, styles.secondaryButton, loading && styles.disabledButton)}
          onClick={onRefineInstead}
          disabled={loading}
        >
          Refine Instead
        </button>
      </div>
    </div>
  );
}