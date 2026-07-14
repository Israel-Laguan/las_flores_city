"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description', render: (item: any) => item.description?.slice(0, 80) },
  {
    key: 'portraitStatus', label: 'Portrait Status',
    render: (item: any) => item.portraitStatus === 'ready'
      ? <span style={{ ...adminStyles.badge, ...adminStyles.successBadge }}>ready</span>
      : <span style={{ ...adminStyles.badge, ...adminStyles.warningBadge }}>missing</span>,
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function CharactersPage() {
  return (
    <ContentListPage
      title="👤 Characters"
      heading="Character Browser"
      endpoint="/api/admin/characters"
      detailPath="/characters"
      columns={columns}
    />
  );
}
