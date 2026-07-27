import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/client-api';

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

  useEffect(() => {
    async function fetchTree() {
      try {
        const data = await adminFetch<LoreTreeResponse>('/admin/lore/tree');
        if (data.success) {
          setTree(data.data.tree);
          const types = new Set(Object.keys(groupByType(data.data.tree)));
          setExpandedTypes(types);
        } else {
          setTreeError('Failed to load lore tree');
        }
      } catch {
        setTreeError('Failed to load lore tree');
      } finally {
        setTreeLoading(false);
      }
    }
    fetchTree();
  }, []);

  const toggleType = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return { tree, treeLoading, treeError, expandedTypes, toggleType, groupByType };
}
