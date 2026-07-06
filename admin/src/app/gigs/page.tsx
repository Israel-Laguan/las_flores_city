"use client";

import ContentListPage from '@/app/_components/ContentListPage';

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'timeBlockCost', label: 'TB Cost' },
  { key: 'creditPayout', label: 'Credit Payout' },
  { key: 'locationName', label: 'Location', render: (item: any) => item.locationName || '—' },
  { key: 'reputationTarget', label: 'Reputation', render: (item: any) => item.reputationTarget ? `${item.reputationTarget} +${item.reputationReward}` : '—' },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function GigsPage() {
  return (
    <ContentListPage
      title="💼 Gigs"
      heading="Gig List"
      endpoint="/api/admin/gigs"
      detailPath="/gigs"
      columns={columns}
    />
  );
}
