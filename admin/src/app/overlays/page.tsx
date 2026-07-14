'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'targetTreeName', label: 'Target Dialogue', render: (item: any) => item.targetTreeName || item.targetTreeId?.slice(0, 8) },
  { key: 'priority', label: 'Priority' },
  {
    key: 'isNsfw', label: 'NSFW',
    render: (item: any) => item.isNsfw
      ? <Badge variant="danger">NSFW</Badge>
      : '—',
  },
  {
    key: 'mysteryTitle', label: 'Mystery',
    render: (item: any) => item.mysteryTitle
      ? <Badge variant="info">{item.mysteryTitle}</Badge>
      : '—',
  },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function OverlaysPage() {
  return (
    <ContentListPage
      title="Dialogue Overlays"
      heading="Overlay List"
      endpoint="/admin/overlays"
      detailPath="/overlays"
      columns={columns}
    />
  );
}
