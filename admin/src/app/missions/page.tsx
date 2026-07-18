'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';
import styles from './missions.module.css';

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'ACTIVE' ? 'success' : status === 'RESOLVING' ? 'warning' : 'muted';
  return <Badge variant={variant as any}>{status}</Badge>;
}

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status', render: (item: any) => <StatusBadge status={item.status} /> },
  { key: 'expiresAt', label: 'Expires', render: (item: any) => item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '—' },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function MissionsPage() {
  return (
    <div>
      <ContentListPage
        title="Missions"
        heading="Mission List"
        endpoint="/admin/missions"
        detailPath="/missions"
        columns={columns}
      />
    </div>
  );
}
