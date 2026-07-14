"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', render: (item: any) => item.description?.slice(0, 80) },
  { key: 'district', label: 'District' },
  {
    key: 'requiredStoryBeat', label: 'Required Story Beat',
    render: (item: any) => item.requiredStoryBeat != null
      ? <span style={{ ...adminStyles.badge, ...adminStyles.infoBadge }}>{item.requiredStoryBeat}</span>
      : '—',
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function ScenesPage() {
  return (
    <ContentListPage
      title="🏙️ Scenes"
      heading="Scene Browser"
      endpoint="/api/admin/scenes"
      detailPath="/scenes"
      columns={columns}
    />
  );
}
