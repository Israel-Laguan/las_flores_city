'use client';

import { cn } from '@las-flores/ui';
import styles from '../migration.module.css';

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

function getActionBadge(action: string) {
  const variant = action === 'created' ? 'success' : action === 'updated' ? 'info' : 'warning';
  return <span className={cn(styles.badge, styles[`${variant}Badge`])}>{action}</span>;
}

function getContentTypeColor(type: string) {
  const colorMap: Record<string, string> = {
    character: styles.infoBadge, dialogue: styles.successBadge, overlay: styles.warningBadge,
    scene: styles.errorBadge, mystery: styles.purpleBadge, vault: styles.orangeBadge,
    shop_item: styles.pinkBadge, location: styles.cyanBadge, gig: styles.tealBadge, map_tile: styles.greenBadge,
  };
  return <span className={cn(styles.badge, colorMap[type] || '')}>{type}</span>;
}

interface Props {
  result: MigrationResult;
}

export default function MigrationResultView({ result }: Props) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Migration Result</h2>
      <div className={result.success ? styles.successBox : styles.errorBox}>
        <p className={styles.resultMessage}>
          {result.success ? 'Migration completed successfully!' : 'Migration completed with errors'}
        </p>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryValue}>{result.filesProcessed}</div>
            <div className={styles.summaryLabel}>Processed</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={cn(styles.summaryValue, styles.warningColor)}>{result.filesSkipped}</div>
            <div className={styles.summaryLabel}>Skipped</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={cn(styles.summaryValue, result.filesFailed > 0 ? styles.errorColor : styles.successColor)}>
              {result.filesFailed}
            </div>
            <div className={styles.summaryLabel}>Failed</div>
          </div>
        </div>
      </div>

      {result.appliedMigrations.length > 0 && (
        <div className={styles.fileGroup}>
          <h3 className={styles.fileGroupTitle}>Applied Migrations</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>File</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Content ID</th>
                <th className={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {result.appliedMigrations.map((m, i) => (
                <tr key={i}>
                  <td className={styles.td}>{m.filePath.split('/').pop()}</td>
                  <td className={styles.td}>{getContentTypeColor(m.contentType)}</td>
                  <td className={styles.td}><code className={styles.code}>{m.contentId}</code></td>
                  <td className={styles.td}>{getActionBadge(m.action)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.errors.length > 0 && (
        <div className={styles.errorBox}>
          <h3 className={styles.errorTitle}>Errors</h3>
          <ul className={styles.errorList}>
            {result.errors.map((err, i) => <li key={i} className={styles.errorItem}>{err}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}