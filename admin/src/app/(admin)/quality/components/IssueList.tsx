'use client';

import { cn } from '@las-flores/ui';
import styles from '../quality.module.css';

interface QualityIssue {
  file?: string;
  contentId?: string;
  message: string;
  severity: 'warning' | 'error';
  checkType: 'density' | 'length' | 'inconsistency' | 'completeness';
}

interface Props {
  issues: QualityIssue[];
  label: string;
  color: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function IssueList({ issues, label, color, isExpanded, onToggle }: Props) {
  if (issues.length === 0) return null;

  return (
    <div className={styles.issueGroup}>
      <div className={styles.collapsibleHeader} onClick={onToggle} role="button" tabIndex={0} aria-expanded={isExpanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
        <span className={styles.issueGroupTitle} style={{ color }}>{label} ({issues.length})</span>
        <span className={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</span>
      </div>
      {isExpanded && issues.map((issue, i) => (
        <div key={i} className={styles.issueRow}>
          <span className={styles.issueIcon}>{issue.severity === 'error' ? '❌' : '⚠️'}</span>
          <div className={styles.issueBody}>
            <div className={styles.issueMessage}>
              {issue.message}
              <span className={cn(styles.badge, issue.severity === 'error' ? styles.errorBadge : styles.warningBadge)}>{issue.severity}</span>
            </div>
            {issue.file && (
              <div className={styles.issueFile}>
                {issue.file}
                {issue.contentId && <span className={styles.issueType}>ID: {issue.contentId.slice(0, 8)}...</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}