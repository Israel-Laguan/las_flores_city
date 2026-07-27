'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/client-api';

interface ListItem { id: string; name?: string; title?: string; [key: string]: unknown; }

function toggleSet(s: Set<string>, setS: (v: Set<string>) => void, id: string) {
  const next = new Set(s);
  if (next.has(id)) next.delete(id); else next.add(id);
  setS(next);
}

export function useMissionEntityLists() {
  const [allCharacters, setAllCharacters] = useState<ListItem[]>([]);
  const [allScenes, setAllScenes] = useState<ListItem[]>([]);
  const [allDialogues, setAllDialogues] = useState<ListItem[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
  const [selectedDialogues, setSelectedDialogues] = useState<Set<string>>(new Set());

  useEffect(() => {
    const endpoints = [
      { url: '/admin/characters', setter: setAllCharacters },
      { url: '/admin/scenes', setter: setAllScenes },
      { url: '/admin/dialogues', setter: setAllDialogues },
    ];
    for (const { url, setter } of endpoints) {
      adminFetch<{ success: boolean; data?: { items: ListItem[] }; error?: string }>(url)
        .then(d => { if (d.success) setter(d.data?.items || []); })
        .catch(() => {});
    }
  }, []);

  const toggleCharacter = useCallback((id: string) => toggleSet(selectedCharacters, setSelectedCharacters, id), [selectedCharacters]);
  const toggleScene = useCallback((id: string) => toggleSet(selectedScenes, setSelectedScenes, id), [selectedScenes]);
  const toggleDialogue = useCallback((id: string) => toggleSet(selectedDialogues, setSelectedDialogues, id), [selectedDialogues]);

  const resetSelections = () => {
    setSelectedCharacters(new Set());
    setSelectedScenes(new Set());
    setSelectedDialogues(new Set());
  };

  return {
    allCharacters, allScenes, allDialogues,
    selectedCharacters, selectedScenes, selectedDialogues,
    toggleCharacter, toggleScene, toggleDialogue,
    resetSelections,
  };
}
