'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description', render: (item: any) => item.description?.slice(0, 80) },
  { key: 'nodeCount', label: 'Node Count' },
  {
    key: 'beatAssociation', label: 'Beat Association',
    render: (item: any) => item.beatAssociation != null
      ? <Badge variant="info">{item.beatAssociation}</Badge>
      : '—',
  },
  { key: 'updatedAt', label: 'Last Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function DialoguesPage() {
  return (
    <ContentListPage
      title="Dialogues"
      heading="Dialogue Trees"
      endpoint="/admin/dialogues"
      detailPath="/dialogues"
      columns={columns}
    />
  );
}
