'use client';

import Link from 'next/link';
import JsonViewer from './JsonViewer';
import styles from './ResultsStep.module.css';

interface ResultsStepProps {
  migrationResult: any;
}

export default function ResultsStep({ migrationResult }: ResultsStepProps) {
  if (!migrationResult) return null;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 5: Results &amp; Assets</h2>

      {migrationResult.success ? (
        <div className={styles.successBox}>
          <p className={styles.boldText}>Migration complete!</p>
          {migrationResult.migrationResult && (
            <p className={styles.fileCount}>
              Processed {migrationResult.migrationResult.filesProcessed ?? 0} files.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.errorBox}>
          <p className={styles.boldText}>Migration failed</p>
          <p className={styles.errorText}>
            {migrationResult.error || 'Unknown error'}
          </p>
        </div>
      )}

      {migrationResult.migrationResult && (
        <JsonViewer data={migrationResult.migrationResult} label="Full Migration Results" defaultOpen={false} />
      )}

      <div className={styles.actions}>
        <Link href="/assets" className={`${styles.button} ${styles.primaryButton}`}>
          View Assets
        </Link>
        <Link href="/story-builder" className={`${styles.button} ${styles.secondaryButton}`}>
          New Plan
        </Link>
      </div>
    </div>
  );
}
