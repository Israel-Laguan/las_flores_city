'use client';

import { useEffect } from 'react';
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
  useEffect(() => {
    if (!migrationStatus) onFetchStatus();
  }, [migrationStatus, onFetchStatus]);

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
          onClick={onFetchStatus}
          disabled={migrating}
          className={cn(styles.button, migrating ? styles.disabledButton : styles.secondaryButton)}
        >
          Refresh Status
        </button>
      </div>

      {migrationError && (
        <div className={styles.errorBox}>
          <pre className={styles.errorPre}>{migrationError}</pre>
        </div>
      )}

      {migrationResult && <MigrationResultView result={migrationResult} />}
      <MigrationStatusView status={migrationStatus} loading={migrating && !migrationStatus} />
    </div>
  );
}
