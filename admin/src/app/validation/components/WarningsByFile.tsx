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
  warningsByFile: Record<string, ValidationError[]>;
  systemWarnings: string[];
}

export default function WarningsByFile({ warningsByFile, systemWarnings }: Props) {
  return (
    <>
      {Object.keys(warningsByFile).length > 0 && (
        <div className={styles.fileGroup}>
          <h3 className={styles.fileGroupTitle}>Warnings by File</h3>
          {Object.entries(warningsByFile).map(([file, warnings]) => (
            <div key={file} className={styles.fileSection}>
              <h4 className={styles.fileHeader}>{file} ({warnings.length} warning{warnings.length !== 1 ? 's' : ''})</h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Line</th>
                    <th className={styles.th}>Severity</th>
                    <th className={styles.th}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {warnings.map((w, i) => (
                    <tr key={i}>
                      <td className={styles.td}>
                        {w.line ? <code className={styles.codeBlock}>L{w.line}{w.column ? `:${w.column}` : ''}</code> : <span className={styles.muted}>—</span>}
                      </td>
                      <td className={styles.td}><span className={cn(styles.badge, styles.warningBadge)}>warning</span></td>
                      <td className={styles.td}>{w.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {systemWarnings.length > 0 && (
        <div className={styles.fileGroup}>
          <h3 className={styles.fileGroupTitle}>System Warnings</h3>
          <ul className={styles.warningList}>
            {systemWarnings.map((w, i) => <li key={i} className={styles.warningItem}>{w}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}