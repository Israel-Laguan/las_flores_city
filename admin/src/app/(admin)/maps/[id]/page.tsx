'use client';

import ContentDetailPage from '@/components/ContentDetailPage';

export default function MapDetailPage() {
  return (
    <ContentDetailPage
      title="Map Tile"
      backHref="/maps"
      backLabel="Maps"
      getBreadcrumbLabel={(record) => {
        if (record && typeof record === 'object') {
          const r = record as Record<string, unknown>;
          if (typeof r.x === 'number' && typeof r.y === 'number') return `Tile ${r.x},${r.y}`;
        }
        return null;
      }}
    />
  );
}
