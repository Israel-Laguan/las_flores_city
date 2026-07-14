"use client";

import ContentListPage from '@/app/_components/ContentListPage';
import { adminStyles } from '@/lib/adminStyles';

const columns = [
  { key: 'districtName', label: 'District', render: (item: any) => item.districtName || '—' },
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  {
    key: 'terrainType', label: 'Terrain',
    render: (item: any) => <span style={{ ...adminStyles.badge, ...adminStyles.infoBadge }}>{item.terrainType}</span>,
  },
  { key: 'rotation', label: 'Rotation', render: (item: any) => `${item.rotation}°` },
  { key: 'isFlipped', label: 'Flipped', render: (item: any) => item.isFlipped ? 'Yes' : 'No' },
  { key: 'updatedAt', label: 'Updated', render: (item: any) => new Date(item.updatedAt).toLocaleDateString() },
];

export default function MapsPage() {
  return (
    <ContentListPage
      title="🗺️ Map Tiles"
      heading="Map Tile List"
      endpoint="/api/admin/maps"
      detailPath="/maps"
      columns={columns}
    />
  );
}
