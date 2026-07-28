import { useState, useEffect, useCallback, useRef } from 'react';
import { adminFetch } from '@/lib/client-api';
import { useTrackedFetch } from './useTrackedFetch';

interface LoreFileEntry {
  path: string;
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
}

interface LoreTreeResponse {
  success: boolean;
  data: { tree: LoreFileEntry[] };
}

function groupByType(files: LoreFileEntry[]): Record<string, LoreFileEntry[]> {
  const groups: Record<string, LoreFileEntry[]> = {};
  for (const file of files) {
    const type = file.type || 'other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(file);
  }
  return groups;
}

export function useLoreTree() {
  const [tree, setTree] = useState<LoreFileEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const { withTracking } = useTrackedFetch();

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    await withTracking(
      () => adminFetch<LoreTreeResponse>('/admin/lore/tree'),
      (data) => {
        setTree(data.data.tree);
        const types = new Set(Object.keys(groupByType(data.data.tree)));
        setExpandedTypes((prev) => {
          if (isInitialLoadRef.current) {
            isInitialLoadRef.current = false;
            return types;
          }
          const merged = new Set(prev);
          for (const type of types) merged.add(type);
          return merged;
        });
      },
      () => setTreeError('Failed to load lore tree'),
      () => setTreeLoading(false),
    );
  }, [withTracking]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return { tree, treeLoading, treeError, expandedTypes, toggleType, groupByType, refetch: fetchTree };
}
