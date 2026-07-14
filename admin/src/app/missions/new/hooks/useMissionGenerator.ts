'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/client-api';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function yamlEscape(s: string): string { return JSON.stringify(s); }

async function writeYaml(filePath: string, content: string) {
  const data = await adminFetch<{ success: boolean; error?: string }>(
    '/admin/content/file', { method: 'PUT', body: JSON.stringify({ path: filePath, content }) },
  );
  if (!data.success) throw new Error(data.error || `Failed to write ${filePath}`);
}

export function useMissionGenerator() {
  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<string[]>([]);

  const handleGenerate = async (config: {
    title: string; description: string; status: string; loreRef: string;
    selectedCharacters: Set<string>; selectedScenes: Set<string>; selectedDialogues: Set<string>;
    vaultItems: Array<{ title: string; description: string; item_type: string }>;
    overlays: Array<{ name: string; target_tree_id: string }>;
    createStory: boolean; storyTitle: string; storyDescription: string; storyLoreRef: string;
  }) => {
    if (!config.title.trim()) { setError('Title is required'); return; }
    setGenerating(true);
    setError(null);
    const links: string[] = [];
    const missionId = generateUUID();
    const shortId = missionId.slice(0, 8);
    const slug = slugify(config.title);

    try {
      const missionYaml = `missions:\n  - id: ${yamlEscape(missionId)}\n    title: ${yamlEscape(config.title)}\n    description: ${yamlEscape(config.description)}\n    status: ${yamlEscape(config.status)}${config.loreRef ? `\n    lore_ref: ${yamlEscape(config.loreRef)}` : ''}`;
      const missionPath = `missions/mission_${slug}_${shortId}.yaml`;
      await writeYaml(missionPath, missionYaml);
      links.push(missionPath);

      const vaultItemIds: string[] = [];
      for (const item of config.vaultItems) {
        const itemId = generateUUID();
        vaultItemIds.push(itemId);
        const itemSlug = slugify(item.title);
        const itemYaml = `vault_items:\n  - id: ${yamlEscape(itemId)}\n    title: ${yamlEscape(item.title)}\n    description: ${yamlEscape(item.description)}\n    item_type: ${yamlEscape(item.item_type)}\n    mission_id: ${yamlEscape(missionId)}`;
        const itemPath = `vault/vault_${itemSlug}_${itemId.slice(0, 8)}.yaml`;
        await writeYaml(itemPath, itemYaml);
        links.push(itemPath);
      }

      const overlayIds: string[] = [];
      for (const overlay of config.overlays) {
        const overlayId = generateUUID();
        overlayIds.push(overlayId);
        const overlaySlug = slugify(overlay.name);
        const overlayYaml = `overlays:\n  - id: ${yamlEscape(overlayId)}\n    name: ${yamlEscape(overlay.name)}\n    target_tree_id: ${yamlEscape(overlay.target_tree_id)}\n    mission_id: ${yamlEscape(missionId)}`;
        const overlayPath = `overlays/overlay_${overlaySlug}_${overlayId.slice(0, 8)}.yaml`;
        await writeYaml(overlayPath, overlayYaml);
        links.push(overlayPath);
      }

      if (config.createStory) {
        const storyId = generateUUID();
        const storyYaml = `stories:\n  - id: ${yamlEscape(storyId)}\n    title: ${yamlEscape(config.storyTitle || config.title)}\n    description: ${yamlEscape(config.storyDescription || config.description)}\n    mission_id: ${yamlEscape(missionId)}\n    characters: [${[...config.selectedCharacters].map(id => yamlEscape(id)).join(', ')}]\n    scenes: [${[...config.selectedScenes].map(id => yamlEscape(id)).join(', ')}]\n    dialogues: [${[...config.selectedDialogues].map(id => yamlEscape(id)).join(', ')}]\n    overlays: [${overlayIds.map(id => yamlEscape(id)).join(', ')}]\n    vault_items: [${vaultItemIds.map(id => yamlEscape(id)).join(', ')}]${config.storyLoreRef ? `\n    lore_ref: ${yamlEscape(config.storyLoreRef)}` : ''}`;
        const storyPath = `stories/story_${slug}_${storyId.slice(0, 8)}.yaml`;
        await writeYaml(storyPath, storyYaml);
        links.push(storyPath);
      }

      setGeneratedLinks(links);
      setGenerated(true);
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setGenerated(false); setStep(1); setGeneratedLinks([]);
  };

  return {
    step, setStep, generating, generated, error, generatedLinks,
    handleGenerate, reset,
  };
}
