'use client';

import { useState, useEffect } from 'react';
import { ListItem } from '../types';

export function useEntityList(listEndpoint: string) {
  const [entities, setEntities] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setEntities([]);
      setLoadError(null);
      try {
        const res = await fetch(listEndpoint);
        const data = await res.json();
        if (active && data.success) setEntities(data.data.items || []);
        else if (active && !data.success) setLoadError(data.error || 'Failed to load items');
      } catch {
        if (active) setLoadError('Failed to load items');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [listEndpoint]);

  return { entities, loading, loadError };
}
