'use client';

import styles from './ApprovingStep.module.css';

const STAGES = [
  'Staging YAML, lore & prompt files',
  'Uploading chosen drafts to MinIO',
  'Migrating content to the database',
  'Verifying cross-references',
];

interface ApprovingStepProps {
  /** Optional count of asset needs being published, for a friendlier hint. */
  assetCount?: number;
}

export default function ApprovingStep({ assetCount = 0 }: ApprovingStepProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Approving &amp; Shipping…</h2>

      <div className={styles.spinnerWrap} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.lead}>
          Hold tight — we&apos;re solidifying your plan in one pass. This usually takes
          10–30 seconds, and up to a few minutes for plans with many images.
        </p>
      </div>

      <ul className={styles.stageList}>
        {STAGES.map((label, i) => (
          <li key={i} className={styles.stageItem}>
            <span className={styles.stageDot} aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>

      {assetCount > 0 && (
        <p className={styles.hint}>
          Publishing {assetCount} chosen draft{assetCount === 1 ? '' : 's'} to the dev
          cascade (label: <code>dev</code>).
        </p>
      )}
    </div>
  );
}
