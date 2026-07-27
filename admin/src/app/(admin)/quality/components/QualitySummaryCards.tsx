'use client';

import { cn } from '@las-flores/ui';
import styles from '../quality.module.css';

interface QualitySummary {
  total: number;
  errors: number;
  warnings: number;
  density: number;
  length: number;
  inconsistency: number;
  completeness: number;
}

export default function QualitySummaryCards({ summary }: { summary: QualitySummary }) {
  return (
    <div className={styles.summaryGrid}>
      <div className={styles.summaryCard}>
        <div className={cn(styles.summaryValue, summary.total > 0 ? styles.warningColor : styles.successColor)}>{summary.total}</div>
        <div className={styles.summaryLabel}>Total Issues</div>
      </div>
      <div className={styles.summaryCard}>
        <div className={cn(styles.summaryValue, summary.errors > 0 ? styles.errorColor : styles.successColor)}>{summary.errors}</div>
        <div className={styles.summaryLabel}>Errors</div>
      </div>
      <div className={styles.summaryCard}>
        <div className={cn(styles.summaryValue, summary.warnings > 0 ? styles.warningColor : styles.successColor)}>{summary.warnings}</div>
        <div className={styles.summaryLabel}>Warnings</div>
      </div>
      <div className={styles.summaryCard}>
        <div className={cn(styles.summaryValue, summary.density > 0 ? styles.warningColor : styles.successColor)}>{summary.density}</div>
        <div className={styles.summaryLabel}>Density</div>
      </div>
      <div className={styles.summaryCard}>
        <div className={cn(styles.summaryValue, summary.length > 0 ? styles.warningColor : styles.successColor)}>{summary.length}</div>
        <div className={styles.summaryLabel}>Length</div>
      </div>
      <div className={styles.summaryCard}>
        <div className={cn(styles.summaryValue, summary.inconsistency > 0 ? styles.errorColor : styles.successColor)}>{summary.inconsistency}</div>
        <div className={styles.summaryLabel}>Inconsistency</div>
      </div>
      <div className={styles.summaryCard}>
        <div className={cn(styles.summaryValue, summary.completeness > 0 ? styles.warningColor : styles.successColor)}>{summary.completeness}</div>
        <div className={styles.summaryLabel}>Completeness</div>
      </div>
    </div>
  );
}