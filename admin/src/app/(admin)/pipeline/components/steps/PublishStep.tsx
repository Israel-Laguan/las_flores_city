'use client';

import { useEffect } from 'react';
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
}

export default function PublishStep({ statuses, loading, publishing, publishError, onFetchStatus, onPublish }: Props) {
  useEffect(() => {
    if (statuses.length === 0 && !loading) onFetchStatus();
  }, [statuses.length, loading, onFetchStatus]);

  const publishedCount = statuses.filter(s => s.stages.production).length;
  const readyCount = statuses.filter(s => s.stages.dev && !s.stages.production).length;
  const allPublished = statuses.length > 0 && publishedCount === statuses.length;
  const anyToPromote = statuses.some(s => s.stages.dev);

  function entityType(contentPath: string): string {
    const first = contentPath.split('/')[0];
    const map: Record<string, string> = { characters: 'Character', scenes: 'Scene', locations: 'Location' };
    return map[first] || first;
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
          disabled={loading}
          className={cn(styles.button, loading ? styles.disabledButton : styles.secondaryButton)}
        >
          {loading ? 'Loading...' : 'Refresh Status'}
        </button>
      </div>

      {publishError && (
        <div className={styles.errorBox}>
          <pre className={styles.errorPre}>{publishError}</pre>
        </div>
      )}

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

      {!loading && statuses.length === 0 && (
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
            </tr>
          </thead>
          <tbody>
            {statuses.map(s => (
              <PromotionRow
                key={s.contentPath}
                status={s}
                entityType={entityType(s.contentPath)}
                disabled={publishing}
                onPromoteStaging={() => {}}
                onPromoteProduction={() => {}}
                onRollbackStaging={() => {}}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
