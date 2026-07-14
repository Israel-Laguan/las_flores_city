'use client';

import { cn } from '@las-flores/ui';
import JsonViewer from './JsonViewer';
import styles from './MigrateStep.module.css';

interface MigrateStepProps {
  loading: boolean;
  stagingResult: any;
  migrationResult: any;
  onMigrate: () => void;
}

export default function MigrateStep({ loading, stagingResult, migrationResult, onMigrate }: MigrateStepProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 4: Migrate to Database</h2>
      <p className={styles.description}>
        Content files are staged and validated. Click migrate to upsert them into the database.
      </p>

      {stagingResult && (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>Staged Files</h3>
          <p className={styles.fileSummary}>
            {stagingResult.createdFiles?.length ?? 0} new, {stagingResult.updatedFiles?.length ?? 0} updated
          </p>
        </div>
      )}

      {migrationResult && (
        <div className={migrationResult.success ? styles.successBox : styles.errorBox}>
          <p className={styles.boldText}>
            {migrationResult.success ? 'Migration complete!' : 'Migration failed'}
          </p>
          {migrationResult.error && (
            <p className={styles.errorText}>{migrationResult.error}</p>
          )}
          {migrationResult.migrationResult && (
            <JsonViewer data={migrationResult.migrationResult} label="Migration Details" defaultOpen={!migrationResult.success} />
          )}
        </div>
      )}

      <button
        className={cn(styles.button, styles.primaryButton, loading && styles.disabledButton)}
        onClick={onMigrate}
        disabled={loading}
      >
        {loading ? 'Migrating...' : 'Migrate to Database'}
      </button>
    </div>
  );
}
