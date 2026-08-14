'use client';

import { cn } from '@las-flores/ui';
import type { CheckedScope, BoundedConflict } from '@las-flores/shared';
import styles from './ConflictScopeReport.module.css';

export interface ConflictScopeReportData {
  checkedScope: CheckedScope[];
  findings: BoundedConflict[];
  passed: boolean;
  createdAt?: string;
}

interface ConflictScopeReportProps {
  report: ConflictScopeReportData | null;
  planId?: string | null;
}

const RULE_LABEL: Record<string, string> = {
  location_conflict: 'Location',
  timeline_overlap: 'Timeline',
  lineage_conflict: 'Lineage',
};

function ScopeBadge({ scope }: { scope: CheckedScope }) {
  return (
    <li className={styles.scopeItem}>
      <span className={styles.scopeRule}>{RULE_LABEL[scope.rule] ?? scope.rule}</span>
      <span className={styles.scopeDesc}>{scope.scopeDescriptor}</span>
      <span className={styles.scopeCount}>{scope.entityIdsChecked.length} entities checked</span>
    </li>
  );
}

/**
 * M25 — renders the bounded conflict report + the recorded "checked scope".
 * Unlike the deterministic verification report, this is advisory: each finding
 * references the neighborhood it was found in, and the checked scope answers
 * "how much did we check?" honestly.
 */
export default function ConflictScopeReport({ report, planId }: ConflictScopeReportProps) {
  if (!report) return null;

  const errors = report.findings.filter((f) => f.severity === 'error');
  const warnings = report.findings.filter((f) => f.severity === 'warning');

  return (
    <div className={styles.section} data-testid="conflict-scope-report">
      <h3 className={styles.heading}>
        Bounded conflict check
        <span className={cn(styles.badge, report.passed ? styles.badgePass : styles.badgeWarn)}>
          {report.passed ? 'no blocking conflicts' : 'conflicts found'}
        </span>
      </h3>
      {planId && <p className={styles.planRef}>plan: {planId}</p>}

      {errors.length + warnings.length === 0 ? (
        <p className={styles.clean}>✓ No bounded conflicts in this neighborhood.</p>
      ) : (
        <ul className={styles.findings}>
          {report.findings.map((f, i) => (
            <li key={i} className={styles.finding}>
              <span className={cn(styles.rule, f.severity === 'error' ? styles.ruleError : styles.ruleWarn)}>
                {RULE_LABEL[f.rule] ?? f.rule}
              </span>
              <span className={styles.findingDesc}>{f.description}</span>
            </li>
          ))}
        </ul>
      )}

      {report.checkedScope.length > 0 && (
        <div className={styles.scopeBlock}>
          <h4 className={styles.scopeTitle}>Checked scope</h4>
          <ul className={styles.scopeList}>
            {report.checkedScope.map((s, i) => (
              <ScopeBadge key={i} scope={s} />
            ))}
          </ul>
        </div>
      )}

      {report.createdAt && (
        <p className={styles.checkedAt} suppressHydrationWarning>
          checked {new Date(report.createdAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}