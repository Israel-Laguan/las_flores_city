"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'title', label: 'Title' },
  {
    key: 'itemType', label: 'Type',
    render: (item: any) => <span style={{ ...adminStyles.badge, ...adminStyles.infoBadge }}>{item.itemType}</span>,
  },
  { key: 'mysteryTitle', label: 'Mystery', render: (item: any) => item.mysteryTitle || '—' },
  { key: 'updatedAt', label: 'Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function VaultPage() {
  return (
    <ContentListPage
      title="🔐 Vault Items"
      heading="Vault Item List"
      endpoint="/api/admin/vault"
      detailPath="/vault"
      columns={columns}
    />
  );
}
