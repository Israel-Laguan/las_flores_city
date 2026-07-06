"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'targetTreeName', label: 'Target Dialogue', render: (item: any) => item.targetTreeName || item.targetTreeId?.slice(0, 8) },
  { key: 'priority', label: 'Priority' },
  {
    key: 'isNsfw', label: 'NSFW',
    render: (item: any) => item.isNsfw
      ? <span style={{ ...adminStyles.badge, backgroundColor: '#ff4444', color: '#fff' }}>NSFW</span>
      : '—',
  },
  {
    key: 'mysteryTitle', label: 'Mystery',
    render: (item: any) => item.mysteryTitle
      ? <span style={{ ...adminStyles.badge, ...adminStyles.infoBadge }}>{item.mysteryTitle}</span>
      : '—',
  },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function OverlaysPage() {
  return (
    <ContentListPage
      title="🔄 Dialogue Overlays"
      heading="Overlay List"
      endpoint="/api/admin/overlays"
      detailPath="/overlays"
      columns={columns}
    />
  );
}
