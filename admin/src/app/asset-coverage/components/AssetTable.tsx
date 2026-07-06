import Link from 'next/link';
import { adminStyles as styles } from '@/lib/adminStyles';

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
    return <span style={styles.muted}>—</span>;
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
  const badgeStyle = status === 'ready' ? styles.successBadge : styles.dangerBadge;
  const label = status === 'ready' ? 'Ready' : 'Missing';
  return <span style={{ ...styles.badge, ...badgeStyle }}>{label}</span>;
}

export default function AssetTable({ title, headers, rows }: AssetTableProps) {
  const missingRows = rows.filter((r) => r.status === 'missing');
  const readyRows = rows.filter((r) => r.status === 'ready');

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>{title}</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...missingRows, ...readyRows].map((row) => (
            <tr key={row.id}>
              <td style={styles.td}>{row.name}</td>
              <td style={styles.td}><StatusBadge status={row.status} /></td>
              <td style={styles.td}><PreviewCell url={row.previewUrl} style={row.previewStyle} /></td>
              <td style={styles.td}>
                <Link
                  href={row.linkHref}
                  style={{ ...styles.button, ...styles.secondaryButton, padding: '0.25rem 0.75rem', fontSize: '0.8rem', textDecoration: 'none' }}
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