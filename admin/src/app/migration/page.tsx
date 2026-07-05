"use client";

import { useState, useEffect, useCallback } from 'react';

interface MigrationFile {
  filePath: string;
  checksum: string;
  contentType: string;
  contentId: string;
  appliedAt: string;
  appliedBy: string | null;
}

interface MigrationStatus {
  totalFiles: number;
  byType: Record<string, MigrationFile[]>;
  files: MigrationFile[];
}

interface AppliedMigration {
  filePath: string;
  contentType: string;
  contentId: string;
  action: 'created' | 'updated' | 'skipped';
}

interface MigrationResult {
  success: boolean;
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  errors: string[];
  appliedMigrations: AppliedMigration[];
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
  secondaryButton: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  dangerButton: { backgroundColor: '#ff4444', color: '#000' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333' },
  badge: { padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' },
  successBadge: { backgroundColor: '#00ff00', color: '#000' },
  errorBadge: { backgroundColor: '#ff4444', color: '#fff' },
  warningBadge: { backgroundColor: '#ffaa00', color: '#000' },
  infoBadge: { backgroundColor: '#0066ff', color: '#fff' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' },
  summaryCard: { textAlign: 'center' as const, padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  summaryValue: { fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' },
  summaryLabel: { color: '#888', fontSize: '0.9rem' },
  muted: { color: '#888' },
  spinner: { display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid #00ff00', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '0.5rem' },
};

export default function MigrationPage() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/content/status');
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (e) {
      setError('Failed to fetch migration status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleMigrate = async () => {
    setMigrating(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/content/migrate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        // Refresh status after migration
        await fetchStatus();
      } else {
        setError(data.data?.errors?.join('\n') || data.error || 'Migration failed');
      }
    } catch (e) {
      setError('Migration request failed');
    } finally {
      setMigrating(false);
    }
  };

  const getActionBadge = (action: string) => {
    const badgeStyles = {
      created: { ...styles.badge, ...styles.successBadge },
      updated: { ...styles.badge, ...styles.infoBadge },
      skipped: { ...styles.badge, ...styles.warningBadge },
    };
    return <span style={badgeStyles[action as keyof typeof badgeStyles] || styles.badge}>{action}</span>;
  };

  const getContentTypeColor = (type: string) => {
    const colors: Record<string, React.CSSProperties> = {
      character: { ...styles.badge, ...styles.infoBadge },
      dialogue: { ...styles.badge, ...styles.successBadge },
      overlay: { ...styles.badge, ...styles.warningBadge },
      scene: { ...styles.badge, ...styles.errorBadge },
      mystery: { ...styles.badge, backgroundColor: '#9900ff', color: '#fff' },
      vault: { ...styles.badge, backgroundColor: '#ff6600', color: '#000' },
      shop_item: { ...styles.badge, backgroundColor: '#ff00ff', color: '#fff' },
      location: { ...styles.badge, backgroundColor: '#00ccff', color: '#000' },
      gig: { ...styles.badge, backgroundColor: '#00ffaa', color: '#000' },
      map_tile: { ...styles.badge, backgroundColor: '#88cc88', color: '#000' },
    };
    return <span style={colors[type] || styles.badge}>{type}</span>;
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>🚀 Content Migration</h1>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={handleMigrate}
          disabled={migrating}
          style={{
            ...styles.button,
            ...(migrating ? styles.disabledButton : styles.primaryButton),
          }}
        >
          {migrating ? '⏳ Migrating...' : '🚀 Run Migration'}
        </button>
        <button
          onClick={fetchStatus}
          disabled={loading}
          style={{
            ...styles.button,
            ...(loading ? styles.disabledButton : styles.secondaryButton),
          }}
        >
          {loading ? '⏳ Loading...' : '🔄 Refresh Status'}
        </button>
      </div>

      {/* Migration Result */}
      {result && (
        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>Migration Result</h2>
          <div style={result.success ? styles.successBox : styles.errorBox}>
            <p style={{ marginBottom: '0.5rem' }}>
              {result.success ? '✅ Migration completed successfully!' : '❌ Migration completed with errors'}
            </p>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryValue}>{result.filesProcessed}</div>
                <div style={styles.summaryLabel}>Processed</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={{ ...styles.summaryValue, color: '#ffaa00' }}>{result.filesSkipped}</div>
                <div style={styles.summaryLabel}>Skipped</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={{ ...styles.summaryValue, color: result.filesFailed > 0 ? '#ff4444' : '#00ff00' }}>
                  {result.filesFailed}
                </div>
                <div style={styles.summaryLabel}>Failed</div>
              </div>
            </div>
          </div>

          {result.appliedMigrations.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ color: '#00ff00', marginBottom: '0.5rem' }}>Applied Migrations</h3>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>File</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Content ID</th>
                    <th style={styles.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.appliedMigrations.map((m, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{m.filePath.split('/').pop()}</td>
                      <td style={styles.td}>{getContentTypeColor(m.contentType)}</td>
                      <td style={styles.td}><code style={{ color: '#aaa' }}>{m.contentId}</code></td>
                      <td style={styles.td}>{getActionBadge(m.action)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.errors.length > 0 && (
            <div style={styles.errorBox}>
              <h3 style={{ color: '#ff4444', marginBottom: '0.5rem' }}>Errors</h3>
              <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                {result.errors.map((err, i) => (
                  <li key={i} style={{ marginBottom: '0.25rem' }}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={styles.errorBox}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</pre>
        </div>
      )}

      {/* Migration Status */}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Migration Status</h2>
        {loading && !status ? (
          <p style={styles.muted}>Loading migration status...</p>
        ) : status ? (
          <>
            <p style={{ marginBottom: '1rem', color: '#888' }}>
              Total files in migration log: <strong style={{ color: '#00ff00' }}>{status.totalFiles}</strong>
            </p>

            {Object.entries(status.byType).map(([type, files]) => (
              <div key={type} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {getContentTypeColor(type)}
                  <span style={{ color: '#888', fontSize: '0.9rem' }}>({files.length} files)</span>
                </h3>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>File</th>
                      <th style={styles.th}>Content ID</th>
                      <th style={styles.th}>Applied At</th>
                      <th style={styles.th}>Applied By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file, i) => (
                      <tr key={i}>
                        <td style={styles.td}><code style={{ color: '#aaa' }}>{file.filePath}</code></td>
                        <td style={styles.td}><code style={{ color: '#aaa' }}>{file.contentId}</code></td>
                        <td style={styles.td}>{new Date(file.appliedAt).toLocaleString()}</td>
                        <td style={styles.td}>{file.appliedBy || <span style={styles.muted}>system</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        ) : (
          <p style={styles.muted}>No migration status available. Run a migration to populate the log.</p>
        )}
      </div>
    </main>
  );
}