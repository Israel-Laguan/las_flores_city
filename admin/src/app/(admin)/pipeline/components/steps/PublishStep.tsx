'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@las-flores/ui';
import PromotionRow from '@/components/promotion/PromotionRow';
import type { PromotionStatus } from '../../hooks/usePipeline';
import styles from '../../pipeline.module.css';

interface Props {
  statuses: PromotionStatus[];
  loading: boolean;
  publishing: boolean;
  publishError: string | null;
  onFetchStatus: () => void;
  onPublish: () => void;
  onPromoteStaging: (contentPath: string) => void;
  onPromoteProduction: (contentPath: string) => void;
  onRollbackStaging: (contentPath: string) => void;
}

export default function PublishStep({ statuses, loading, publishing, publishError, onFetchStatus, onPublish, onPromoteStaging, onPromoteProduction, onRollbackStaging }: Props) {
  const initialFetchRef = useRef(false);
  useEffect(() => {
    if (statuses.length === 0 && !loading && !initialFetchRef.current) {
      initialFetchRef.current = true;
      onFetchStatus();
    }
  }, [statuses.length, loading, onFetchStatus]);

  const publishedCount = statuses.filter(s => s.stages.production).length;
  const readyCount = statuses.filter(s => s.stages.dev && !s.stages.production).length;
  const allPublished = statuses.length > 0 && publishedCount === statuses.length;
  const anyToPromote = statuses.some(s => s.stages.dev && !s.stages.production);

function entityType(contentPath: string): string {
  const segments = contentPath.split('/');
  if (segments.includes('locations')) return 'Location';
  const map: Record<string, string> = { characters: 'Character', scenes: 'Scene', districts: 'District' };
  for (const seg of segments) {
    if (map[seg]) return map[seg];
  }
  return segments[0] || 'Unknown';
}

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>5. Publish</h2>
      <p className={styles.stepDescription}>
        Promote assets through the dev → staging → production pipeline.
      </p>

      <div className={styles.buttonBar}>
        <button
          onClick={onPublish}
          disabled={publishing || !anyToPromote}
          className={cn(
            styles.button,
            (publishing || !anyToPromote) ? styles.disabledButton : styles.primaryButton,
          )}
        >
          {publishing ? 'Publishing...' : allPublished ? 'All Published' : 'Publish All'}
        </button>
        <button
          onClick={onFetchStatus}
          disabled={loading || publishing}
          className={cn(styles.button, loading || publishing ? styles.disabledButton : styles.secondaryButton)}
        >
          {loading ? 'Loading...' : 'Refresh Status'}
        </button>
      </div>

      <div className={styles.publishSummary}>
        <span className={styles.publishStat}>
          <strong>{publishedCount}</strong> published
        </span>
        <span className={styles.publishStat}>
          <strong>{readyCount}</strong> ready to publish
        </span>
        <span className={styles.publishStat}>
          <strong>{statuses.length}</strong> total entities
        </span>
      </div>

      {loading && <p className={styles.muted}>Loading promotion status...</p>}

      {!loading && publishError && (
        <div className={styles.errorBox}>
          <pre className={styles.errorPre}>{publishError}</pre>
        </div>
      )}

      {!loading && !publishError && statuses.length === 0 && (
        <p className={styles.muted}>No entities found for asset publishing.</p>
      )}

      {!loading && statuses.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Type</th>
              <th className={styles.th}>Entity</th>
              <th className={styles.th}>Dev</th>
              <th className={styles.th}>Staging</th>
              <th className={styles.th}>Production</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map(s => (
              <PromotionRow
                key={s.contentPath}
                status={s}
                entityType={entityType(s.contentPath)}
                disabled={publishing}
                onPromoteStaging={onPromoteStaging}
                onPromoteProduction={onPromoteProduction}
                onRollbackStaging={onRollbackStaging}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
