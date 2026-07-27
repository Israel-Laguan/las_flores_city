import Link from 'next/link';
import styles from './AssetTable.module.css';
import { cn } from '@las-flores/ui';

interface AssetTableRow {
  id: string;
  name: string;
  status: 'ready' | 'missing';
  previewUrl?: string;
  previewStyle?: React.CSSProperties;
  linkHref: string;
}

interface AssetTableProps {
  title: string;
  headers: string[];
  rows: AssetTableRow[];
}

function PreviewCell({ url, style }: { url?: string; style?: React.CSSProperties }) {
  if (!url) {
    return <span className={styles.muted}>—</span>;
  }
  return (
    <img
      src={url}
      alt="preview"
      style={style ?? { width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function StatusBadge({ status }: { status: 'ready' | 'missing' }) {
  const badgeClass = status === 'ready' ? styles.successBadge : styles.dangerBadge;
  const label = status === 'ready' ? 'Ready' : 'Missing';
  return <span className={cn(styles.badge, badgeClass)}>{label}</span>;
}

export default function AssetTable({ title, headers, rows }: AssetTableProps) {
  const missingRows = rows.filter((r) => r.status === 'missing');
  const readyRows = rows.filter((r) => r.status === 'ready');

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>{title}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...missingRows, ...readyRows].map((row) => (
            <tr key={row.id}>
              <td className={styles.td}>{row.name}</td>
              <td className={styles.td}><StatusBadge status={row.status} /></td>
              <td className={styles.td}><PreviewCell url={row.previewUrl} style={row.previewStyle} /></td>
              <td className={styles.td}>
                <Link
                  href={row.linkHref}
                  className={styles.viewLink}
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
