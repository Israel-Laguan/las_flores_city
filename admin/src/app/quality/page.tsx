"use client";

import { useState } from 'react';

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

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  button: {
    padding: '0.75rem 1.5rem',
    borderRadius: '5px',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    cursor: 'pointer',
    border: 'none',
    fontSize: '1rem',
  },
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  summaryCard: { textAlign: 'center' as const, padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  summaryValue: { fontSize: '2rem', fontWeight: 'bold' },
  summaryLabel: { color: '#888', fontSize: '0.9rem' },
  filterBar: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const, marginBottom: '1.5rem' },
  filterBtn: {
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    border: '1px solid #333',
    backgroundColor: 'transparent',
    color: '#aaa',
    fontSize: '0.85rem',
  },
  filterBtnActive: {
    padding: '0.5rem 1rem',
    borderRadius: '5px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    border: '1px solid #00ff00',
    backgroundColor: '#00ff0022',
    color: '#00ff00',
    fontSize: '0.85rem',
  },
  issueRow: { padding: '0.75rem 1rem', borderBottom: '1px solid #222', display: 'flex', gap: '1rem', alignItems: 'flex-start' },
  issueIcon: { fontSize: '1.1rem', flexShrink: 0, marginTop: '0.1rem' },
  issueBody: { flex: 1 },
  issueMessage: { marginBottom: '0.25rem' },
  issueFile: { color: '#888', fontSize: '0.8rem' },
  issueType: { color: '#555', fontSize: '0.75rem', textTransform: 'uppercase' as const, marginLeft: '0.5rem' },
  errorBadge: { backgroundColor: '#ff4444', color: '#fff', padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold' },
  warningBadge: { backgroundColor: '#ffaa00', color: '#000', padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '1rem', borderRadius: '5px', marginBottom: '1.5rem' },
  warningBox: { background: '#ffaa0033', border: '1px solid #ffaa00', padding: '1rem', borderRadius: '5px', marginBottom: '1.5rem' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginBottom: '1.5rem' },
  muted: { color: '#888' },
  collapsibleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    padding: '0.75rem 1rem',
    backgroundColor: '#0d0d1a',
    borderRadius: '5px',
    marginBottom: '0.5rem',
    border: '1px solid #333',
  },
};

type CheckType = 'all' | 'density' | 'length' | 'inconsistency' | 'completeness';

// eslint-disable-next-line max-lines-per-function
export default function QualityPage() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CheckType>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    density: true,
    length: true,
    inconsistency: true,
    completeness: true,
  });

  const handleRun = async () => {
    setRunning(true);
    setReport(null);
    setSummary(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/content/quality', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
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

  const renderIssues = (issues: QualityIssue[], label: string, color: string) => {
    const filtered = getFilteredIssues(issues);
    if (filtered.length === 0 && filter !== 'all') return null;
    const isExpanded = expanded[label.toLowerCase()] ?? true;

    return (
      <div key={label} style={{ marginBottom: '1rem' }}>
        <div
          style={styles.collapsibleHeader}
          onClick={() => toggleSection(label.toLowerCase())}
        >
          <span style={{ color, fontWeight: 'bold' }}>
            {label} ({filtered.length})
          </span>
          <span style={{ color: '#666' }}>{isExpanded ? '▲' : '▼'}</span>
        </div>
        {isExpanded && filtered.map((issue, i) => (
          <div key={i} style={styles.issueRow}>
            <span style={styles.issueIcon}>
              {issue.severity === 'error' ? '❌' : '⚠️'}
            </span>
            <div style={styles.issueBody}>
              <div style={styles.issueMessage}>
                {issue.message}
                <span style={{ ...styles.errorBadge, marginLeft: '0.5rem' }}>{issue.severity}</span>
              </div>
              {issue.file && (
                <div style={styles.issueFile}>
                  📄 {issue.file}
                  {issue.contentId && (
                    <span style={styles.issueType}>ID: {issue.contentId.slice(0, 8)}...</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>📊 Content Quality Dashboard</h1>

      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            ...styles.button,
            ...(running ? styles.disabledButton : styles.primaryButton),
          }}
        >
          {running ? '⏳ Running...' : '▶ Run Quality Check'}
        </button>
      </div>

      {summary && (
        <>
          {summary.errors === 0 && summary.warnings === 0 ? (
            <div style={styles.successBox}>
              ✅ All content passes quality checks — no issues found.
            </div>
          ) : summary.errors > 0 ? (
            <div style={styles.errorBox}>
              ❌ Found {summary.errors} error(s) and {summary.warnings} warning(s) across {summary.total} issues.
            </div>
          ) : (
            <div style={styles.warningBox}>
              ⚠️ Found {summary.warnings} warning(s). No blocking errors.
            </div>
          )}

          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: summary.total > 0 ? '#ffaa00' : '#00ff00' }}>
                {summary.total}
              </div>
              <div style={styles.summaryLabel}>Total Issues</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: summary.errors > 0 ? '#ff4444' : '#00ff00' }}>
                {summary.errors}
              </div>
              <div style={styles.summaryLabel}>Errors</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: summary.warnings > 0 ? '#ffaa00' : '#00ff00' }}>
                {summary.warnings}
              </div>
              <div style={styles.summaryLabel}>Warnings</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: summary.density > 0 ? '#ffaa00' : '#00ff00' }}>
                {summary.density}
              </div>
              <div style={styles.summaryLabel}>Density</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: summary.length > 0 ? '#ffaa00' : '#00ff00' }}>
                {summary.length}
              </div>
              <div style={styles.summaryLabel}>Length</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: summary.inconsistency > 0 ? '#ff4444' : '#00ff00' }}>
                {summary.inconsistency}
              </div>
              <div style={styles.summaryLabel}>Inconsistency</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: summary.completeness > 0 ? '#ffaa00' : '#00ff00' }}>
                {summary.completeness}
              </div>
              <div style={styles.summaryLabel}>Completeness</div>
            </div>
          </div>

          <div style={styles.filterBar}>
            {(['all', 'density', 'length', 'inconsistency', 'completeness'] as CheckType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={filter === f ? styles.filterBtnActive : styles.filterBtn}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}

      {report && (
        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>Issues by Category</h2>
          {renderIssues(report.density, 'Density', '#ffaa00')}
          {renderIssues(report.length, 'Length', '#ffaa00')}
          {renderIssues(report.inconsistency, 'Inconsistency', '#ff4444')}
          {renderIssues(report.completeness, 'Completeness', '#ffaa00')}
          {filter !== 'all' && getFilteredIssues([
            ...report.density,
            ...report.length,
            ...report.inconsistency,
            ...report.completeness,
          ]).length === 0 && (
            <p style={{ color: '#00ff00', textAlign: 'center', padding: '2rem' }}>
              ✅ No {filter} issues found.
            </p>
          )}
        </div>
      )}

      {error && (
        <div style={styles.errorBox}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</pre>
        </div>
      )}

      {!report && !error && !running && (
        <div style={styles.section}>
          <p style={styles.muted}>
            Click <strong style={{ color: '#00ff00' }}>Run Quality Check</strong> to analyze content
            for density, length, inconsistency, and completeness issues.
          </p>
          <p style={{ ...styles.muted, marginTop: '0.5rem', fontSize: '0.85rem' }}>
            Quality checks are advisory — they never block content migration.
          </p>
        </div>
      )}
    </main>
  );
}
