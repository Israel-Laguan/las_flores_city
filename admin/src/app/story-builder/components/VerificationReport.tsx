'use client';

import { useState } from 'react';
import type { CheckResult, VerificationReport } from '@las-flores/shared';
import styles from './VerificationReport.module.css';

const STATUS_ICON: Record<CheckResult['status'], string> = {
  pass: '✓',
  fail: '✗',
  warn: '!',
};

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(check.status !== 'pass');
  const hasDetails = Array.isArray(check.details) && check.details.length > 0;

  return (
    <li className={styles.checkRow}>
      <button
        type="button"
        className={styles.checkHeader}
        onClick={() => hasDetails && setOpen(!open)}
        aria-expanded={hasDetails ? open : undefined}
        disabled={!hasDetails}
      >
        <span className={`${styles.statusIcon} ${styles[check.status]}`} aria-hidden>
          {STATUS_ICON[check.status]}
        </span>
        <span className={styles.checkName}>{check.name}</span>
        <span className={styles.checkDescription}>{check.description}</span>
        {hasDetails && (
          <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
        )}
      </button>
      {hasDetails && open && (
        <ul className={styles.detailList}>
          {check.details!.map((detail, i) => (
            <li key={i} className={styles.detailItem}>
              {detail}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface VerificationReportProps {
  report: VerificationReport;
}

export default function VerificationReport({ report }: VerificationReportProps) {
  const failed = report.checks.filter(c => c.status === 'fail').length;
  const warned = report.checks.filter(c => c.status === 'warn').length;
  const passed = report.checks.filter(c => c.status === 'pass').length;
  const errors = report.errors ?? [];
  const warnings = report.warnings ?? [];

  return (
    <div className={`${styles.container} ${report.passed ? styles.passed : styles.failed}`}>
      <div className={styles.summaryBar}>
        <span className={`${styles.banner} ${report.passed ? styles.bannerPass : styles.bannerFail}`}>
          {report.passed ? 'Verification passed' : 'Verification failed'}
        </span>
        <span className={styles.counts}>
          <span className={styles.passCount}>{passed} pass</span>
          <span className={styles.warnCount}>{warned} warn</span>
          <span className={styles.failCount}>{failed} fail</span>
        </span>
        <span className={styles.checkedAt}>
          {new Date(report.checkedAt).toLocaleString()}
        </span>
      </div>

      {errors.length > 0 && (
        <ul className={styles.errorList}>
          {errors.map((err, i) => (
            <li key={i} className={styles.errorItem}>{err}</li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className={styles.warningList}>
          {warnings.map((warn, i) => (
            <li key={i} className={styles.warningItem}>{warn}</li>
          ))}
        </ul>
      )}

      <ul className={styles.checkList}>
        {report.checks.map((check, i) => (
          <CheckRow key={i} check={check} />
        ))}
      </ul>
    </div>
  );
}
