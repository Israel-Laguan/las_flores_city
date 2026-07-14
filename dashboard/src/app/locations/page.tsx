"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', render: (item: any) => item.description?.slice(0, 60) },
  { key: 'district', label: 'District', render: (item: any) => item.district || '—' },
  {
    key: 'requiredStoryBeat', label: 'Required Beat',
    render: (item: any) => item.requiredStoryBeat
      ? <span style={{ ...adminStyles.badge, ...adminStyles.infoBadge }}>{item.requiredStoryBeat}</span>
      : '—',
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function LocationsPage() {
  return (
    <ContentListPage
      title="📍 Locations"
      heading="Location List"
      endpoint="/api/admin/locations"
      detailPath="/locations"
      columns={columns}
    />
  );
}
