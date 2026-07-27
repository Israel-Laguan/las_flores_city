'use client';

import { useState, useEffect } from 'react';
import { ListItem, SectionConfig } from '../types';

export function useEntityDetail(
  listEndpoint: string,
  sections: SectionConfig[],
  selectedId: string
) {
  const [selectedData, setSelectedData] = useState<any>(null);
  const [available, setAvailable] = useState<Record<string, ListItem[]>>({});

  useEffect(() => {
    if (!selectedId) {
      setSelectedData(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const detailRes = await fetch(`${listEndpoint}/${selectedId}`);
        const detailData = await detailRes.json();
        if (active && detailData.success) setSelectedData(detailData.data);

        const availResults = await Promise.all(
          sections.map(section =>
            fetch(section.availableEndpoint).then(r => r.json()).then(d => [section.field, d] as const)
          )
        );
        const availMap: Record<string, ListItem[]> = {};
        for (const [field, d] of availResults) {
          if (d.success) availMap[field] = d.data.items || [];
        }
        if (active) setAvailable(availMap);
      } catch {
        // Error handled by parent
      }
    })();
    return () => { active = false; };
  }, [selectedId, listEndpoint, sections]);

  return { selectedData, setSelectedData, available };
}
