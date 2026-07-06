"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

function StatusBadge({ status }: { status: string }) {
  const badgeStyle = status === 'ACTIVE' ? { backgroundColor: '#00ff00', color: '#000' }
    : status === 'RESOLVING' ? { backgroundColor: '#ffaa00', color: '#000' }
    : { backgroundColor: '#888', color: '#fff' };
  return <span style={{ ...adminStyles.badge, ...badgeStyle }}>{status}</span>;
}

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status', render: (item: any) => <StatusBadge status={item.status} /> },
  { key: 'expiresAt', label: 'Expires', render: (item: any) => item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '—' },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function MissionsPage() {
  return (
    <ContentListPage
      title="🔍 Missions"
      heading="Mission List"
      endpoint="/api/admin/missions"
      detailPath="/missions"
      columns={columns}
    />
  );
}
