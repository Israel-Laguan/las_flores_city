'use client';

import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';

const columns = [
  { key: 'name', label: 'Name' },
  {
    key: 'itemType', label: 'Type',
    render: (item: any) => <Badge variant="info">{item.itemType}</Badge>,
  },
  { key: 'price', label: 'Price' },
  { key: 'currencyType', label: 'Currency' },
  {
    key: 'isActive', label: 'Active',
    render: (item: any) => item.isActive
      ? <Badge variant="success">Active</Badge>
      : <Badge variant="danger">Inactive</Badge>,
  },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

export default function ShopPage() {
  return (
    <ContentListPage
      title="Shop Items"
      heading="Shop Item List"
      endpoint="/admin/shop"
      detailPath="/shop"
      columns={columns}
    />
  );
}
