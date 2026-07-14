"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'name', label: 'Name' },
  {
    key: 'itemType', label: 'Type',
    render: (item: any) => <span style={{ ...adminStyles.badge, ...adminStyles.infoBadge }}>{item.itemType}</span>,
  },
  { key: 'price', label: 'Price' },
  { key: 'currencyType', label: 'Currency' },
  {
    key: 'isActive', label: 'Active',
    render: (item: any) => item.isActive
      ? <span style={{ ...adminStyles.badge, ...adminStyles.successBadge }}>Active</span>
      : <span style={{ ...adminStyles.badge, ...adminStyles.dangerBadge }}>Inactive</span>,
  },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function ShopPage() {
  return (
    <ContentListPage
      title="🛒 Shop Items"
      heading="Shop Item List"
      endpoint="/api/admin/shop"
      detailPath="/shop"
      columns={columns}
    />
  );
}
