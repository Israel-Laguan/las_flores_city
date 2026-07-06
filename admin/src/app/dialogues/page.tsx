"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', render: (item: any) => item.description?.slice(0, 80) },
  { key: 'nodeCount', label: 'Node Count' },
  {
    key: 'beatAssociation', label: 'Beat Association',
    render: (item: any) => item.beatAssociation != null
      ? <span style={{ ...adminStyles.badge, ...adminStyles.infoBadge }}>{item.beatAssociation}</span>
      : '—',
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function DialoguesPage() {
  return (
    <ContentListPage
      title="💬 Dialogues"
      heading="Dialogue Trees"
      endpoint="/api/admin/dialogues"
      detailPath="/dialogues"
      columns={columns}
    />
  );
}
