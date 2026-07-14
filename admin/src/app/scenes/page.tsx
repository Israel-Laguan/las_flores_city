'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', render: (item: any) => item.description?.slice(0, 80) },
  { key: 'district', label: 'District' },
  {
    key: 'requiredStoryBeat', label: 'Required Story Beat',
    render: (item: any) => item.requiredStoryBeat != null
      ? <Badge variant="info">{item.requiredStoryBeat}</Badge>
      : '—',
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function ScenesPage() {
  return (
    <ContentListPage
      title="Scenes"
      heading="Scene Browser"
      endpoint="/admin/scenes"
      detailPath="/scenes"
      columns={columns}
    />
  );
}
