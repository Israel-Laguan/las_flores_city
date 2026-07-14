'use client';

import { cn } from '@/lib/cn';
import PreviewItem from './PreviewItem';
import styles from './StageStep.module.css';

interface StageStepProps {
  loading: boolean;
  previewData: any;
  stagingResult: any;
  onPreview: () => void;
  onStage: () => void;
  onRetry: () => void;
}

export default function StageStep({ loading, previewData, stagingResult, onPreview, onStage, onRetry }: StageStepProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 3: Stage Content</h2>
      <p className={styles.description}>
        Preview the files that will be created, then stage them. Staging writes YAML files and validates them &mdash; but does NOT migrate to the database yet.
      </p>

      <button
        className={cn(styles.button, styles.secondaryButton)}
        onClick={onPreview}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Preview Files'}
      </button>

      {previewData && (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>
            Files Preview ({previewData.items.length} items)
          </h3>
          {previewData.items.map((item: any, i: number) => (
            <PreviewItem key={i} item={item} index={i} />
          ))}
        </div>
      )}

      {stagingResult && (
        <div className={stagingResult.success ? styles.successBox : styles.errorBox}>
          <p className={styles.boldText}>
            {stagingResult.success ? 'Staged successfully!' : 'Staging failed'}
          </p>

          {/* Staging summary */}
          {stagingResult.createdFiles?.length > 0 && (
            <p className={styles.fileList}>Created: {stagingResult.createdFiles.join(', ')}</p>
          )}
          {stagingResult.updatedFiles?.length > 0 && (
            <p className={styles.fileList}>Updated: {stagingResult.updatedFiles.join(', ')}</p>
          )}
          {stagingResult.validationErrors?.length > 0 && (
            <ul className={styles.errorList}>
              {stagingResult.validationErrors.map((e: string, i: number) => (
                <li key={i} className={styles.errorItem}>{e}</li>
              ))}
            </ul>
          )}
          {stagingResult.loreFiles?.length > 0 && (
            <p className={styles.fileList}>Lore files created: {stagingResult.loreFiles.join(', ')}</p>
          )}
          {stagingResult.promptFiles?.length > 0 && (
            <div>
              <p className={styles.fileList}>Prompt files created: {stagingResult.promptFiles.join(', ')}</p>
              <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                These can be used in the <a href="/assets" style={{ color: 'var(--accent)' }}>Asset Pipeline</a>.
              </p>
            </div>
          )}

          {/* Item status table */}
          {stagingResult.itemResults && (
            <div>
              <p className={styles.itemStatusTitle}>Item Status</p>
              <table className={styles.itemTable}>
                <tbody>
                  {stagingResult.itemResults.map((r: any, i: number) => (
                    <tr key={i} className={styles.tableRow}>
                      <td className={styles.tableCellName}>{r.name}</td>
                      <td className={styles.tableCell}>
                        <span className={cn(styles.statusBadge, r.status === 'success' ? styles.statusSuccess : styles.statusError)}>
                          {r.status}
                        </span>
                      </td>
                      <td className={styles.tableCellInfo}>{r.error || r.filePath || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!stagingResult.success && (
                <button
                  className={cn(styles.button, styles.secondaryButton, styles.retryButton)}
                  onClick={onRetry}
                  disabled={loading}
                >
                  {loading ? 'Retrying...' : '\u{1F504} Retry Failed Items'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button
        className={cn(styles.button, styles.primaryButton, loading && styles.disabledButton)}
        onClick={onStage}
        disabled={loading}
      >
        {loading ? 'Staging...' : 'Stage Content'}
      </button>
    </div>
  );
}
