'use client';

import { useState, useEffect } from 'react';
import { SectionConfig } from '../types';
import { useEntityList } from './useEntityList';
import { useEntityDetail } from './useEntityDetail';
import { usePendingOps } from './usePendingOps';
import { adminFetch } from '@/lib/client-api';

export interface TabConfigLike {
  label: string;
  listEndpoint: string;
  entityName: string;
  entityType: string;
  sections: SectionConfig[];
}

export function useContentLinker(tab: TabConfigLike, initialId?: string) {
  const [selectedId, setSelectedId] = useState<string>(initialId || '');

  // Resolver state: associate the resolved path with the selected ID so that
  // contentPath is only non-null when it matches the currently selected entity.
  // This prevents cross-entity YAML writes even during brief async windows.
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [resolvedForId, setResolvedForId] = useState<string | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);

  // contentPath is only exposed when it belongs to the currently selected entity
  const contentPath = resolvedForId === selectedId ? resolvedPath : null;

  const { entities, loading, loadError } = useEntityList(tab.listEndpoint);
  const { selectedData, setSelectedData, available } = useEntityDetail(tab.listEndpoint, tab.sections, selectedId);
  const { pendingOps, saving, error, success, addPendingOp, removePendingOp, handleSave, resetOps } = usePendingOps();

  // Resolve the canonical YAML content path for the selected entity via the
  // admin content resolver. The per-folder content layout means we cannot
  // construct the path from the entity id alone (e.g. characters/<slug>/char_<slug>.yaml).
  useEffect(() => {
    if (!selectedId) {
      setResolvedPath(null);
      setResolvedForId(null);
      setPathLoading(false);
      setPathError(null);
      return;
    }
    let active = true;
    setPathLoading(true);
    setPathError(null);
    adminFetch<{ success: boolean; data?: { path: string }; error?: string }>(
      `/admin/content/by-id?type=${encodeURIComponent(tab.entityType)}&id=${encodeURIComponent(selectedId)}`
    ).then((data) => {
      if (!active) return;
      if (data.success && data.data?.path) {
        setResolvedPath(data.data.path);
        setResolvedForId(selectedId);
        setPathLoading(false);
        setPathError(null);
      } else {
        setResolvedPath(null);
        setResolvedForId(null);
        setPathLoading(false);
        setPathError(data.error || 'Content file not found');
      }
    }).catch((err) => {
      if (!active) return;
      setResolvedPath(null);
      setResolvedForId(null);
      setPathLoading(false);
      setPathError(
        err?.status === 404
          ? 'Content file not found'
          : err?.message || 'Failed to resolve content path'
      );
    });
    return () => { active = false; };
  }, [selectedId, tab.entityType]);

  const selectEntity = (id: string) => {
    setSelectedId(id);
    resetOps();
  };

  return {
    entities, loading, loadError, selectedId, selectedData, available, contentPath,
    pathLoading, pathError,
    pendingOps, saving, error, success,
    addPendingOp, removePendingOp, handleSave: (config: { listEndpoint: string }) => handleSave(config, selectedId, setSelectedData), selectEntity,
  };
}
