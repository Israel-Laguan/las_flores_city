'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@las-flores/ui';
import MigrationResultView from '@/components/migration/MigrationResultView';
import MigrationStatusView from '@/components/migration/MigrationStatusView';
import type { MigrationStatus, MigrationResult } from '../../hooks/usePipeline';
import styles from '../../pipeline.module.css';

interface Props {
  migrationStatus: MigrationStatus | null;
  migrationResult: MigrationResult | null;
  migrationError: string | null;
  migrating: boolean;
  onMigrate: () => void;
  onFetchStatus: () => void;
}

export default function MigrateStep({
  migrationStatus, migrationResult, migrationError, migrating, onMigrate, onFetchStatus,
}: Props) {
  const [fetchingStatus, setFetchingStatus] = useState(false);
  const initialFetchRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    setFetchingStatus(true);
    try {
      await onFetchStatus();
    } finally {
      setFetchingStatus(false);
    }
  }, [onFetchStatus]);

  useEffect(() => {
    if (migrationStatus || initialFetchRef.current) return;
    initialFetchRef.current = true;
    handleRefresh();
  }, [migrationStatus, handleRefresh]);

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>3. Migrate Content</h2>
      <p className={styles.stepDescription}>
        Migrate validated YAML files into the database.
      </p>

      <div className={styles.buttonBar}>
        <button
          onClick={onMigrate}
          disabled={migrating}
          className={cn(styles.button, migrating ? styles.disabledButton : styles.primaryButton)}
        >
          {migrating ? 'Migrating...' : 'Run Migration'}
        </button>
        <button
          onClick={handleRefresh}
          disabled={migrating || fetchingStatus}
          className={cn(styles.button, migrating || fetchingStatus ? styles.disabledButton : styles.secondaryButton)}
        >
          {fetchingStatus ? 'Loading...' : 'Refresh Status'}
        </button>
      </div>

      {migrationError && (
        <div className={styles.errorBox}>
          <pre className={styles.errorPre}>{migrationError}</pre>
        </div>
      )}

      {migrationResult && <MigrationResultView result={migrationResult} />}
      <MigrationStatusView status={migrationStatus} loading={fetchingStatus && !migrationStatus} />
    </div>
  );
}
