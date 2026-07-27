'use client';

import { cn } from '@las-flores/ui';
import styles from '../validation.module.css';

interface Props {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  systemWarningCount: number;
}

export default function ValidationSummary({ valid, errorCount, warningCount, systemWarningCount }: Props) {
  return (
    <div className={valid ? styles.successBox : styles.errorBox}>
      <p className={styles.resultMessage}>
        {valid ? 'All content files passed validation!' : 'Validation found errors'}
      </p>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={cn(styles.summaryValue, errorCount > 0 ? styles.errorColor : styles.successColor)}>{errorCount}</div>
          <div className={styles.summaryLabel}>Errors</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={cn(styles.summaryValue, warningCount > 0 ? styles.warningColor : styles.successColor)}>{warningCount}</div>
          <div className={styles.summaryLabel}>Warnings</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{systemWarningCount}</div>
          <div className={styles.summaryLabel}>System Warnings</div>
        </div>
      </div>
    </div>
  );
}