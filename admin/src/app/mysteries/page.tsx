'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'title', label: 'Title' },
  {
    key: 'status', label: 'Status',
    render: (item: any) => {
      const variant = item.status === 'ACTIVE' ? 'success' : item.status === 'RESOLVING' ? 'warning' : 'muted';
      return <Badge variant={variant}>{item.status}</Badge>;
    },
  },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function MysteriesPage() {
  return (
    <ContentListPage
      title="Mysteries"
      heading="Mystery List"
      endpoint="/admin/mysteries"
      detailPath="/mysteries"
      columns={columns}
    />
  );
}
