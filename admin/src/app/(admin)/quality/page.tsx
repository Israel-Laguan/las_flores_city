'use client';

import { useState } from 'react';
import styles from './quality.module.css';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import QualitySummaryCards from './components/QualitySummaryCards';
import IssueList from './components/IssueList';

interface QualityIssue {
  file?: string;
  contentId?: string;
  message: string;
  severity: 'warning' | 'error';
  checkType: 'density' | 'length' | 'inconsistency' | 'completeness';
}

interface QualityReport {
  density: QualityIssue[];
  length: QualityIssue[];
  inconsistency: QualityIssue[];
  completeness: QualityIssue[];
}

interface QualitySummary {
  density: number;
  length: number;
  inconsistency: number;
  completeness: number;
  total: number;
  errors: number;
  warnings: number;
}

type CheckType = 'all' | 'density' | 'length' | 'inconsistency' | 'completeness';

export default function QualityPage() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CheckType>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    density: true, length: true, inconsistency: true, completeness: true,
  });

  const handleRun = async () => {
    setRunning(true);
    setReport(null);
    setSummary(null);
    setError(null);
    try {
      const data = await adminFetch<{ success: boolean; data?: { report: QualityReport; summary: QualitySummary }; error?: string }>(
        '/admin/content/quality', { method: 'POST' },
      );
      if (data.success && data.data) {
        setReport(data.data.report);
        setSummary(data.data.summary);
      } else {
        setError(data.error || 'Quality check failed');
      }
    } catch {
      setError('Quality check request failed');
    } finally {
      setRunning(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getFilteredIssues = (issues: QualityIssue[]): QualityIssue[] => {
    if (filter === 'all') return issues;
    return issues.filter(i => i.checkType === filter);
  };

  return (
    <main className={styles.main}>
      <h1>Content Quality Dashboard</h1>

      <div className={styles.buttonBar}>
        <button onClick={handleRun} disabled={running}
          className={cn(styles.button, running ? styles.disabledButton : styles.primaryButton)}>
          {running ? 'Running...' : 'Run Quality Check'}
        </button>
      </div>

      {summary && (
        <>
          {summary.errors === 0 && summary.warnings === 0 ? (
            <div className={styles.successBox}>All content passes quality checks — no issues found.</div>
          ) : summary.errors > 0 ? (
            <div className={styles.errorBox}>Found {summary.errors} error(s) and {summary.warnings} warning(s) across {summary.total} issues.</div>
          ) : (
            <div className={styles.warningBox}>Found {summary.warnings} warning(s). No blocking errors.</div>
          )}

          <QualitySummaryCards summary={summary} />

          <div className={styles.filterBar}>
            {(['all', 'density', 'length', 'inconsistency', 'completeness'] as CheckType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn(styles.filterBtn, filter === f && styles.filterBtnActive)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}

      {report && (
        <div className={styles.section}>
          <h2 className={styles.sectionHeading}>Issues by Category</h2>
          <IssueList issues={getFilteredIssues(report.density)} label="Density" color="#ffaa00" isExpanded={expanded.density} onToggle={() => toggleSection('density')} />
          <IssueList issues={getFilteredIssues(report.length)} label="Length" color="#ffaa00" isExpanded={expanded.length} onToggle={() => toggleSection('length')} />
          <IssueList issues={getFilteredIssues(report.inconsistency)} label="Inconsistency" color="#ff4444" isExpanded={expanded.inconsistency} onToggle={() => toggleSection('inconsistency')} />
          <IssueList issues={getFilteredIssues(report.completeness)} label="Completeness" color="#ffaa00" isExpanded={expanded.completeness} onToggle={() => toggleSection('completeness')} />
          {filter !== 'all' && getFilteredIssues([...report.density, ...report.length, ...report.inconsistency, ...report.completeness]).length === 0 && (
            <p className={styles.cleanMessage}>No {filter} issues found.</p>
          )}
        </div>
      )}

      {error && <div className={styles.errorBox}><pre className={styles.errorPre}>{error}</pre></div>}

      {!report && !error && !running && (
        <div className={styles.section}>
          <p className={styles.muted}>Click <strong>Run Quality Check</strong> to analyze content for density, length, inconsistency, and completeness issues.</p>
          <p className={styles.mutedSmall}>Quality checks are advisory — they never block content migration.</p>
        </div>
      )}
    </main>
  );
}