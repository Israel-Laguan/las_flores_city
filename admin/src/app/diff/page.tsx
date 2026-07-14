'use client';

import { useState } from 'react';
import styles from './diff.module.css';
import { cn } from '@/lib/cn';
import { adminFetch } from '@/lib/client-api';

interface DiffFile {
  filePath: string;
  checksum: string | null;
  status: 'unchanged' | 'new' | 'modified' | 'deleted' | 'error';
  knownChecksum: string | null;
}

interface DiffResult {
  totalFiles: number;
  newFiles: number;
  modifiedFiles: number;
  unchangedFiles: number;
  deletedFiles: number;
  files: DiffFile[];
}

function statusBadgeStyle(status: string) {
  switch (status) {
    case 'new': return styles.newBadge;
    case 'modified': return styles.modifiedBadge;
    case 'deleted': return styles.deletedBadge;
    case 'error': return styles.errorBadge;
    default: return styles.unchangedBadge;
  }
}

function FileChangesTable({ files }: { files: DiffFile[] }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>File Changes</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>File</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Checksum (current)</th>
            <th className={styles.th}>Checksum (migrated)</th>
          </tr>
        </thead>
        <tbody>
          {files.filter(f => f.status !== 'unchanged').map(file => (
            <tr key={file.filePath}>
              <td className={styles.td}>{file.filePath}</td>
              <td className={styles.td}>
                <span className={cn(styles.badge, statusBadgeStyle(file.status))}>{file.status}</span>
              </td>
              <td className={styles.td} title={file.checksum ?? ''}>
                {file.checksum ? `${file.checksum.slice(0, 12)}...` : '—'}
              </td>
              <td className={styles.td} title={file.knownChecksum ?? ''}>
                {file.knownChecksum ? `${file.knownChecksum.slice(0, 12)}...` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DiffPage() {
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDiff() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<{ success: boolean; data?: DiffResult; error?: string }>(
        '/admin/content/diff',
        { method: 'POST' },
      );
      if (data.success) {
        setResult(data.data ?? null);
      } else {
        setError(data.error || 'Failed to compute diff');
      }
    } catch {
      setError('Failed to compute diff');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1>Content Diff Preview</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>Compare Local Files vs Migration Log</h2>
        <p className={styles.description}>
          Preview which YAML files have changed since the last migration before running it.
        </p>
        <button
          onClick={runDiff}
          disabled={loading}
          className={cn(styles.button, loading ? styles.disabledButton : styles.primaryButton)}
        >
          {loading ? 'Computing...' : 'Run Diff'}
        </button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {result && (
        <>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={cn(styles.summaryValue, styles.successColor)}>{result.totalFiles}</div>
              <div className={styles.summaryLabel}>Total Files</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={cn(styles.summaryValue, styles.successColor)}>{result.newFiles}</div>
              <div className={styles.summaryLabel}>New Files</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={cn(styles.summaryValue, styles.warningColor)}>{result.modifiedFiles}</div>
              <div className={styles.summaryLabel}>Modified Files</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={cn(styles.summaryValue, styles.mutedColor)}>{result.unchangedFiles}</div>
              <div className={styles.summaryLabel}>Unchanged Files</div>
            </div>
          </div>

          {result.modifiedFiles === 0 && result.newFiles === 0 && result.deletedFiles === 0 ? (
            <div className={styles.successBox}>
              <p>All files are unchanged. No migration needed.</p>
            </div>
          ) : (
            <FileChangesTable files={result.files} />
          )}

          <div className={styles.linkBar}>
            <a href="/migration" className={styles.link}>
              → Go to Migration Page to apply changes
            </a>
          </div>
        </>
      )}
    </main>
  );
}
