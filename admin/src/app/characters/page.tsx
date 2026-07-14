'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description', render: (item: any) => item.description?.slice(0, 80) },
  {
    key: 'portraitStatus', label: 'Portrait Status',
    render: (item: any) => item.portraitStatus === 'ready'
      ? <Badge variant="success">ready</Badge>
      : <Badge variant="warning">missing</Badge>,
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function CharactersPage() {
  return (
    <ContentListPage
      title="Characters"
      heading="Character Browser"
      endpoint="/admin/characters"
      detailPath="/characters"
      columns={columns}
    />
  );
}
