'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'title', label: 'Title' },
  {
    key: 'itemType', label: 'Type',
    render: (item: any) => <Badge variant="info">{item.itemType}</Badge>,
  },
  { key: 'mysteryTitle', label: 'Mystery', render: (item: any) => item.mysteryTitle || '—' },
  { key: 'updatedAt', label: 'Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function VaultPage() {
  return (
    <ContentListPage
      title="Vault Items"
      heading="Vault Item List"
      endpoint="/admin/vault"
      detailPath="/vault"
      columns={columns}
    />
  );
}
