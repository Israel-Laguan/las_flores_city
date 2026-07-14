'use client';

import { useState } from 'react';

interface VaultItemDraft { title: string; description: string; item_type: 'clue' | 'memento' | 'premium_cg'; }

interface OverlayDraft { name: string; target_tree_id: string; }

export function useMissionForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [loreRef, setLoreRef] = useState('');

  const [vaultItems, setVaultItems] = useState<VaultItemDraft[]>([]);
  const [overlays, setOverlays] = useState<OverlayDraft[]>([]);

  const [createStory, setCreateStory] = useState(true);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyDescription, setStoryDescription] = useState('');
  const [storyLoreRef, setStoryLoreRef] = useState('');

  const resetForm = () => {
    setTitle(''); setDescription(''); setStatus('ACTIVE'); setLoreRef('');
    setVaultItems([]); setOverlays([]);
    setCreateStory(true); setStoryTitle(''); setStoryDescription(''); setStoryLoreRef('');
  };

  return {
    title, setTitle, description, setDescription, status, setStatus, loreRef, setLoreRef,
    vaultItems, setVaultItems, overlays, setOverlays,
    createStory, setCreateStory, storyTitle, setStoryTitle, storyDescription, setStoryDescription, storyLoreRef, setStoryLoreRef,
    resetForm,
  };
}
