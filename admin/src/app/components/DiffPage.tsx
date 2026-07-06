"use client";

import { useState } from 'react';

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  button: { padding: '0.75rem 1.5rem', borderRadius: '5px', fontWeight: 'bold', fontFamily: 'monospace', cursor: 'pointer', border: 'none', fontSize: '1rem' },
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333' },
  badge: { padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' },
  unchangedBadge: { backgroundColor: '#555', color: '#999' },
  newBadge: { backgroundColor: '#00ff00', color: '#000' },
  modifiedBadge: { backgroundColor: '#ffaa00', color: '#000' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  summaryCard: { textAlign: 'center' as const, padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  summaryValue: { fontSize: '2rem', fontWeight: 'bold' },
  summaryLabel: { color: '#888', fontSize: '0.9rem' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  muted: { color: '#888' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
};

interface DiffFile {
  filePath: string;
  checksum: string;
  status: 'unchanged' | 'new' | 'modified';
  knownChecksum: string | null;
}

interface DiffResult {
  totalFiles: number;
  newFiles: number;
  modifiedFiles: number;
  unchangedFiles: number;
  files: DiffFile[];
}

function statusBadgeStyle(status: string) {
  switch (status) {
    case 'new': return styles.newBadge;
    case 'modified': return styles.modifiedBadge;
    default: return styles.unchangedBadge;
  }
}

function FileChangesTable({ files }: { files: DiffFile[] }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>File Changes</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>File</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Checksum (current)</th>
            <th style={styles.th}>Checksum (migrated)</th>
          </tr>
        </thead>
        <tbody>
          {files.filter(f => f.status !== 'unchanged').map(file => (
            <tr key={file.filePath}>
              <td style={styles.td}>{file.filePath}</td>
              <td style={styles.td}>
                <span style={{ ...styles.badge, ...statusBadgeStyle(file.status) }}>{file.status}</span>
              </td>
              <td style={styles.td} title={file.checksum}>{file.checksum.slice(0, 12)}...</td>
              <td style={styles.td} title={file.knownChecksum ?? ''}>
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
      const res = await fetch('/api/admin/content/diff', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
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
    <main style={styles.main}>
      <h1 style={styles.heading}>📋 Content Diff Preview</h1>

      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Compare Local Files vs Migration Log</h2>
        <p style={{ ...styles.muted, marginBottom: '1rem' }}>
          Preview which YAML files have changed since the last migration before running it.
        </p>
        <button
          onClick={runDiff}
          disabled={loading}
          style={{ ...styles.button, ...(loading ? styles.disabledButton : styles.primaryButton) }}
        >
          {loading ? '⏳ Computing...' : '🔍 Run Diff'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {result && (
        <>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#00ff00' }}>{result.totalFiles}</div>
              <div style={styles.summaryLabel}>Total Files</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#00ff00' }}>{result.newFiles}</div>
              <div style={styles.summaryLabel}>New Files</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#ffaa00' }}>{result.modifiedFiles}</div>
              <div style={styles.summaryLabel}>Modified Files</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={{ ...styles.summaryValue, color: '#888' }}>{result.unchangedFiles}</div>
              <div style={styles.summaryLabel}>Unchanged Files</div>
            </div>
          </div>

          {result.modifiedFiles === 0 && result.newFiles === 0 ? (
            <div style={styles.successBox}>
              <p>All files are unchanged. No migration needed.</p>
            </div>
          ) : (
            <FileChangesTable files={result.files} />
          )}

          <div style={{ marginTop: '1rem' }}>
            <a href="/migration" style={{ color: '#00ff00', textDecoration: 'none', fontSize: '0.9rem' }}>
              → Go to Migration Page to apply changes
            </a>
          </div>
        </>
      )}
    </main>
  );
}
