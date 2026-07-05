"use client";

import { useState } from 'react';

interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
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
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333', verticalAlign: 'top' as const },
  badge: { padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' },
  errorBadge: { backgroundColor: '#ff4444', color: '#fff' },
  warningBadge: { backgroundColor: '#ffaa00', color: '#000' },
  successBadge: { backgroundColor: '#00ff00', color: '#000' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' },
  summaryCard: { textAlign: 'center' as const, padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  summaryValue: { fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' },
  summaryLabel: { color: '#888', fontSize: '0.9rem' },
  muted: { color: '#888' },
  fileGroup: { marginBottom: '1.5rem' },
  fileHeader: { color: '#00ff00', marginBottom: '0.5rem', fontFamily: 'monospace' },
  codeBlock: { backgroundColor: '#0d0d1a', padding: '0.25rem 0.5rem', borderRadius: '3px', color: '#aaa', fontSize: '0.85rem' },
};

export default function ValidationPage() {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    setValidating(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/content/validate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || 'Validation failed');
      }
    } catch (e) {
      setError('Validation request failed');
    } finally {
      setValidating(false);
    }
  };

  // Group errors by file
  const errorsByFile: Record<string, ValidationError[]> = {};
  const warningsByFile: Record<string, ValidationError[]> = {};
  if (result?.errors) {
    for (const err of result.errors) {
      const file = err.file || 'unknown';
      if (err.severity === 'warning') {
        if (!warningsByFile[file]) warningsByFile[file] = [];
        warningsByFile[file].push(err);
      } else {
        if (!errorsByFile[file]) errorsByFile[file] = [];
        errorsByFile[file].push(err);
      }
    }
  }

  const errorCount = result?.errors?.filter(e => e.severity === 'error').length || 0;
  const warningCount = result?.errors?.filter(e => e.severity === 'warning').length || 0;

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>✅ Content Validation</h1>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={handleValidate}
          disabled={validating}
          style={{
            ...styles.button,
            ...(validating ? styles.disabledButton : styles.primaryButton),
          }}
        >
          {validating ? '⏳ Validating...' : '✅ Run Validation'}
        </button>
      </div>

      {/* Validation Result */}
      {result && (
        <div style={styles.section}>
          <h2 style={styles.sectionHeading}>Validation Result</h2>

          {/* Summary */}
          <div style={result.valid ? styles.successBox : styles.errorBox}>
            <p style={{ marginBottom: '0.5rem' }}>
              {result.valid
                ? '✅ All content files passed validation!'
                : '❌ Validation found errors'}
            </p>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={{ ...styles.summaryValue, color: errorCount > 0 ? '#ff4444' : '#00ff00' }}>
                  {errorCount}
                </div>
                <div style={styles.summaryLabel}>Errors</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={{ ...styles.summaryValue, color: warningCount > 0 ? '#ffaa00' : '#00ff00' }}>
                  {warningCount}
                </div>
                <div style={styles.summaryLabel}>Warnings</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryValue}>{result.warnings.length}</div>
                <div style={styles.summaryLabel}>System Warnings</div>
              </div>
            </div>
          </div>

          {/* Errors grouped by file */}
          {Object.keys(errorsByFile).length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ color: '#ff4444', marginBottom: '1rem' }}>Errors by File</h3>
              {Object.entries(errorsByFile).map(([file, errors]) => (
                <div key={file} style={styles.fileGroup}>
                  <h4 style={styles.fileHeader}>
                    <span style={{ color: '#ff4444' }}>📄</span> {file}
                    <span style={{ color: '#888', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                      ({errors.length} error{errors.length !== 1 ? 's' : ''})
                    </span>
                  </h4>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Line</th>
                        <th style={styles.th}>Severity</th>
                        <th style={styles.th}>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((err, i) => (
                        <tr key={i}>
                          <td style={styles.td}>
                            {err.line ? (
                              <code style={styles.codeBlock}>
                                L{err.line}{err.column ? `:${err.column}` : ''}
                              </code>
                            ) : (
                              <span style={styles.muted}>—</span>
                            )}
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge, ...styles.errorBadge }}>error</span>
                          </td>
                          <td style={styles.td}>{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* Warnings grouped by file */}
          {Object.keys(warningsByFile).length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ color: '#ffaa00', marginBottom: '1rem' }}>Warnings by File</h3>
              {Object.entries(warningsByFile).map(([file, warnings]) => (
                <div key={file} style={styles.fileGroup}>
                  <h4 style={styles.fileHeader}>
                    <span style={{ color: '#ffaa00' }}>⚠️</span> {file}
                    <span style={{ color: '#888', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                      ({warnings.length} warning{warnings.length !== 1 ? 's' : ''})
                    </span>
                  </h4>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Line</th>
                        <th style={styles.th}>Severity</th>
                        <th style={styles.th}>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warnings.map((w, i) => (
                        <tr key={i}>
                          <td style={styles.td}>
                            {w.line ? (
                              <code style={styles.codeBlock}>
                                L{w.line}{w.column ? `:${w.column}` : ''}
                              </code>
                            ) : (
                              <span style={styles.muted}>—</span>
                            )}
                          </td>
                          <td style={styles.td}>
                            <span style={{ ...styles.badge, ...styles.warningBadge }}>warning</span>
                          </td>
                          <td style={styles.td}>{w.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* System warnings */}
          {result.warnings.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ color: '#ffaa00', marginBottom: '0.5rem' }}>System Warnings</h3>
              <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                {result.warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: '0.25rem', color: '#ffaa00' }}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* No issues */}
          {result.valid && errorCount === 0 && warningCount === 0 && (
            <div style={{ marginTop: '1rem', color: '#00ff00' }}>
              <p>✨ All content is clean — no errors or warnings.</p>
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

      {/* Initial state */}
      {!result && !error && !validating && (
        <div style={styles.section}>
          <p style={styles.muted}>
            Click <strong style={{ color: '#00ff00' }}>Run Validation</strong> to validate all content files
            against their schemas. Results will be grouped by file with severity indicators.
          </p>
        </div>
      )}
    </main>
  );
}