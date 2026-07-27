'use client';

import { useState } from 'react';
import { SectionConfig } from '../types';
import { useEntityList } from './useEntityList';
import { useEntityDetail } from './useEntityDetail';
import { usePendingOps } from './usePendingOps';

export function useContentLinker(tab: { label: string; listEndpoint: string; entityName: string; sections: SectionConfig[] }) {
  const [selectedId, setSelectedId] = useState<string>('');

  const { entities, loading, loadError } = useEntityList(tab.listEndpoint);
  const { selectedData, setSelectedData, available } = useEntityDetail(tab.listEndpoint, tab.sections, selectedId);
  const { pendingOps, saving, error, success, addPendingOp, removePendingOp, handleSave, resetOps } = usePendingOps();

  const selectEntity = (id: string) => {
    setSelectedId(id);
    resetOps();
  };

  return {
    entities, loading, loadError, selectedId, selectedData, available,
    pendingOps, saving, error, success,
    addPendingOp, removePendingOp, handleSave: (config: { listEndpoint: string }) => handleSave(config, selectedId, setSelectedData), selectEntity,
  };
}
