'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'title', label: 'Title' },
  {
    key: 'gigType', label: 'Type',
    render: (item: any) => <Badge variant="info">{item.gigType}</Badge>,
  },
  { key: 'districtName', label: 'District' },
  { key: 'rewardAmount', label: 'Reward' },
  { key: 'isActive', label: 'Active', render: (item: any) => item.isActive ? 'Yes' : 'No' },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function GigsPage() {
  return (
    <ContentListPage
      title="Gigs"
      heading="Gig List"
      endpoint="/admin/gigs"
      detailPath="/gigs"
      columns={columns}
    />
  );
}
