'use client';

import { cn } from '@/lib/cn';
import styles from '../validation.module.css';

interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

interface Props {
  errorsByFile: Record<string, ValidationError[]>;
}

export default function ErrorsByFile({ errorsByFile }: Props) {
  if (Object.keys(errorsByFile).length === 0) return null;

  return (
    <div className={styles.fileGroup}>
      <h3 className={styles.fileGroupTitle}>Errors by File</h3>
      {Object.entries(errorsByFile).map(([file, errors]) => (
        <div key={file} className={styles.fileSection}>
          <h4 className={styles.fileHeader}>{file} ({errors.length} error{errors.length !== 1 ? 's' : ''})</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Line</th>
                <th className={styles.th}>Severity</th>
                <th className={styles.th}>Message</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((err, i) => (
                <tr key={i}>
                  <td className={styles.td}>
                    {err.line ? <code className={styles.codeBlock}>L{err.line}{err.column ? `:${err.column}` : ''}</code> : <span className={styles.muted}>—</span>}
                  </td>
                  <td className={styles.td}><span className={cn(styles.badge, styles.errorBadge)}>error</span></td>
                  <td className={styles.td}>{err.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
