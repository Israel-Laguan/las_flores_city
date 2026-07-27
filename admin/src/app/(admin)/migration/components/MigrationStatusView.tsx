'use client';

import { cn } from '@las-flores/ui';
import styles from '../migration.module.css';

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

function getContentTypeColor(type: string) {
  const colorMap: Record<string, string> = {
    character: styles.infoBadge, dialogue: styles.successBadge, overlay: styles.warningBadge,
    scene: styles.errorBadge, mystery: styles.purpleBadge, vault: styles.orangeBadge,
    shop_item: styles.pinkBadge, location: styles.cyanBadge, gig: styles.tealBadge, map_tile: styles.greenBadge,
  };
  return <span className={cn(styles.badge, colorMap[type] || '')}>{type}</span>;
}

interface Props {
  status: MigrationStatus | null;
  loading: boolean;
}

export default function MigrationStatusView({ status, loading }: Props) {
  if (loading && !status) {
    return <p className={styles.muted}>Loading migration status...</p>;
  }
  if (!status) {
    return <p className={styles.muted}>No migration status available. Run a migration to populate the log.</p>;
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Migration Status</h2>
      <p className={styles.statusSummary}>
        Total files in migration log: <strong>{status.totalFiles}</strong>
      </p>
      {Object.entries(status.byType).map(([type, files]) => (
        <div key={type} className={styles.typeSection}>
          <h3 className={styles.typeHeader}>
            {getContentTypeColor(type)}
            <span className={styles.fileCount}>({files.length} files)</span>
          </h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>File</th>
                <th className={styles.th}>Content ID</th>
                <th className={styles.th}>Applied At</th>
                <th className={styles.th}>Applied By</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file, i) => (
                <tr key={i}>
                  <td className={styles.td}><code className={styles.code}>{file.filePath}</code></td>
                  <td className={styles.td}><code className={styles.code}>{file.contentId}</code></td>
                  <td className={styles.td} suppressHydrationWarning>{new Date(file.appliedAt).toLocaleString()}</td>
                  <td className={styles.td}>{file.appliedBy || <span className={styles.muted}>system</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}