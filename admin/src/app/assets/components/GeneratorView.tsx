"use client";

import { useState } from 'react';
import type { AssetBase, AssetVariant, AssetListAllResponse, Category } from '../page';
import { API_BASE } from '../page';
import BaseCard from './BaseCard';
import BasesSection from './BasesSection';
import VariantCard from './VariantCard';
import VariantForm from './VariantForm';
import PublishBaseSection from './PublishBaseSection';
import GeneratorHeader from './GeneratorHeader';

type Props = {
  selectedEntry: Category['entries'][0];
  bases: AssetBase[];
  variants: AssetVariant[];
  groups: AssetListAllResponse['groups'];
  newBaseIds: Set<string>;
  loading: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  setLoading: (v: boolean) => void;
  setBases: (v: AssetBase[] | ((prev: AssetBase[]) => AssetBase[])) => void;
  setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void;
  setNewBaseIds: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setView: (v: 'catalog' | 'generator') => void;
  setSelectedEntry: (v: Category['entries'][0] | null) => void;
  loadGroups: (setGroups: (groups: AssetListAllResponse['groups']) => void) => Promise<void>;
  loadAssets: (setLoading: (v: boolean) => void, setError: (v: string | null) => void, setBases: (v: AssetBase[]) => void, setVariants: (v: AssetVariant[]) => void, prompt_rel: string) => Promise<void>;
};

async function deleteBase(baseId: string, setLoading: (v: boolean) => void, setError: (v: string | null) => void, setBases: (v: AssetBase[] | ((prev: AssetBase[]) => AssetBase[])) => void, setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void, loadGroups: (setGroups: (groups: AssetListAllResponse['groups']) => void) => Promise<void>, groups: AssetListAllResponse['groups']) {
  if (!confirm('Are you sure? This will also delete all variants.')) return;
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/bases/${baseId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setBases(prev => prev.filter(b => b.id !== baseId));
      setVariants(prev => prev.filter(v => v.base_id !== baseId));
      await loadGroups((newGroups) => newGroups);
    } else {
      setError(data.error || 'Failed to delete base');
    }
  } catch (e) {
    setError('Failed to delete base');
  } finally {
    setLoading(false);
  }
}

async function approveBase(baseId: string, setLoading: (v: boolean) => void, setError: (v: string | null) => void, setBases: (v: AssetBase[] | ((prev: AssetBase[]) => AssetBase[])) => void) {
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/approve-base`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_id: baseId }),
    });
    const data = await res.json();
    if (data.success) {
      setBases(prev => prev.map(b => ({ ...b, chosen: b.id === baseId })));
    }
  } catch (e) {
    setError('Failed to approve base');
  } finally {
    setLoading(false);
  }
}

async function generateVariant(baseId: string, variantName: string, variantPrompt: string, variantNegative: string, i2iStrength: number, setLoading: (v: boolean) => void, setError: (v: string | null) => void, setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void, setVariantName: (v: string) => void, setVariantPrompt: (v: string) => void, setVariantNegative: (v: string) => void) {
  if (!variantName || !variantPrompt) {
    setError('Variant name and prompt are required');
    return;
  }
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`${API_BASE}/generate-variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_id: baseId,
        variants: [{
          variant_name: variantName,
          prompt: variantPrompt,
          i2i_strength: i2iStrength,
          negative_prompt: variantNegative || undefined,
        }],
      }),
    });
    const data = await res.json();
    if (data.success) {
      setVariants(prev => [...prev, ...data.data]);
      setVariantName('');
      setVariantPrompt('');
      setVariantNegative('');
    } else {
      setError(data.error || 'Failed to generate variant');
    }
  } catch (e) {
    setError('Failed to generate variant');
  } finally {
    setLoading(false);
  }
}

async function generateAllVariants(baseId: string, selectedEntry: Category['entries'][0], setLoading: (v: boolean) => void, setError: (v: string | null) => void, setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void) {
  if (!selectedEntry) return;
  setLoading(true);
  setError(null);
  try {
    const nonBaseVariants = selectedEntry.variants.filter(v => !v.name.toLowerCase().includes('base'));
    if (nonBaseVariants.length === 0) {
      setError('No variants found in prompt file');
      setLoading(false);
      return;
    }

    const payloadVariants = nonBaseVariants.map(v => ({
      variant_name: v.name,
      prompt: v.prompt,
      i2i_strength: 0.7,
      negative_prompt: v.negative_prompt || undefined,
    }));

    const res = await fetch(`${API_BASE}/generate-variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_id: baseId,
        variants: payloadVariants,
      }),
    });
    const data = await res.json();
    if (data.success) {
      setVariants(prev => [...prev, ...data.data]);
    } else {
      setError(data.error || 'Failed to generate all variants');
    }
  } catch (e) {
    setError('Failed to generate all variants');
  } finally {
    setLoading(false);
  }
}

async function deleteVariant(variantId: string, setLoading: (v: boolean) => void, setError: (v: string | null) => void, setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void, loadGroups: () => Promise<void>) {
  if (!confirm('Are you sure?')) return;
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/variants/${variantId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setVariants(prev => prev.filter(v => v.id !== variantId));
      await loadGroups();
    } else {
      setError(data.error || 'Failed to delete variant');
    }
  } catch (e) {
    setError('Failed to delete variant');
  } finally {
    setLoading(false);
  }
}

async function generateBases({ selectedEntry, setLoading, setError, setBases, setNewBaseIds, loadGroups }: {
  selectedEntry: Category['entries'][0];
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setBases: (v: AssetBase[] | ((prev: AssetBase[]) => AssetBase[])) => void;
  setNewBaseIds: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  loadGroups: () => Promise<void>;
}) {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`${API_BASE}/generate-bases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_rel: selectedEntry.prompt_rel, count: 4 }),
    });
    const data = await res.json();
    if (data.success) {
      setBases(prev => [...prev, ...data.data]);
      setNewBaseIds(prev => {
        const newIds = new Set(prev);
        data.data.forEach((base: AssetBase) => newIds.add(base.id));
        return newIds;
      });
      await loadGroups();
    } else {
      setError(data.error || 'Failed to generate bases');
    }
  } catch (e) {
    setError('Failed to generate bases');
  } finally {
    setLoading(false);
  }
}

async function importLocalDrafts({ selectedEntry, setLoading, setError, loadAssets, loadGroups }: {
  selectedEntry: Category['entries'][0];
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  loadAssets: (prompt_rel: string) => Promise<void>;
  loadGroups: () => Promise<void>;
}) {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`${API_BASE}/import-drafts?prompt_rel=${encodeURIComponent(selectedEntry.prompt_rel)}`);
    const data = await res.json();
    if (data.success) {
      await loadAssets(selectedEntry.prompt_rel);
      await loadGroups();
    } else {
      setError(data.error || 'Failed to import local drafts');
    }
  } catch (e) {
    setError('Failed to import local drafts');
  } finally {
    setLoading(false);
  }
}

async function deleteAllBases(bases: AssetBase[], setLoading: (v: boolean) => void, setError: (v: string | null) => void, setBases: (v: AssetBase[] | ((prev: AssetBase[]) => AssetBase[])) => void, setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void, setNewBaseIds: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void, loadGroups: () => Promise<void>) {
  if (!confirm('Are you sure you want to delete ALL bases and variants for this asset? This cannot be undone.')) return;
  setLoading(true);
  setError(null);
  try {
    for (const base of bases) {
      await fetch(`${API_BASE}/bases/${base.id}`, { method: 'DELETE' });
    }
    setBases([]);
    setVariants([]);
    setNewBaseIds(new Set());
    await loadGroups();
  } catch (e) {
    setError('Failed to delete all bases');
  } finally {
    setLoading(false);
  }
}

async function publishAsset(baseId?: string, variantId?: string, setLoading: (v: boolean) => void, setError: (v: string | null) => void, loadAssets: (prompt_rel: string) => Promise<void>, selectedEntry: Category['entries'][0]) {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`${API_BASE}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_id: baseId, variant_id: variantId }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`Published to: ${data.data.url}`);
      await loadAssets(selectedEntry.prompt_rel);
    } else {
      setError(data.error || 'Failed to publish');
    }
  } catch (e) {
    setError('Failed to publish');
  } finally {
    setLoading(false);
  }
}

export default function GeneratorView({
  selectedEntry,
  bases,
  variants,
  groups,
  newBaseIds,
  loading,
  error,
  setError,
  setLoading,
  setBases,
  setVariants,
  setNewBaseIds,
  setView,
  setSelectedEntry,
  loadGroups,
  loadAssets,
}: Props) {
  const [variantName, setVariantName] = useState('');
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantNegative, setVariantNegative] = useState('');
  const [i2iStrength, setI2iStrength] = useState(0.7);

  const chosenBase = bases.find(b => b.chosen);

  return (
    <div>
      <GeneratorHeader selectedEntry={selectedEntry} onBack={() => { setView('catalog'); setSelectedEntry(null); }} />

      <BasesSection
        bases={bases}
        groups={groups}
        newBaseIds={newBaseIds}
        loading={loading}
        onDeleteAll={() => deleteAllBases(bases, setLoading, setError, setBases, setVariants, setNewBaseIds, loadGroups)}
        onGenerate={() => generateBases({ selectedEntry, setLoading, setError, setBases, setNewBaseIds, loadGroups })}
        onImport={() => importLocalDrafts({ selectedEntry, setLoading, setError, loadAssets, loadGroups })}
        onDeleteBase={(baseId) => deleteBase(baseId, setLoading, setError, setBases, setVariants, loadGroups)}
        onApproveBase={(baseId) => approveBase(baseId, setLoading, setError, setBases)}
      />

      {chosenBase && (
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ color: '#00ff00', marginBottom: '1rem' }}>Step 2: Generate Variants (i2i)</h2>
          <VariantForm
            variantName={variantName}
            variantPrompt={variantPrompt}
            variantNegative={variantNegative}
            i2iStrength={i2iStrength}
            onVariantNameChange={setVariantName}
            onVariantPromptChange={setVariantPrompt}
            onVariantNegativeChange={setVariantNegative}
            onI2iStrengthChange={setI2iStrength}
            onGenerateVariant={() => generateVariant(chosenBase.id, variantName, variantPrompt, variantNegative, i2iStrength, setLoading, setError, setVariants, setVariantName, setVariantPrompt, setVariantNegative)}
            onGenerateAllVariants={() => generateAllVariants(chosenBase.id, selectedEntry, setLoading, setError, setVariants)}
            loading={loading}
          />

          <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>Generated Variants</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {variants.map(v => (
              <VariantCard
                key={v.id}
                variant={v}
                loading={loading}
                onPublish={(variantId) => publishAsset(undefined, variantId, setLoading, setError, loadAssets, selectedEntry)}
                onDelete={(variantId) => deleteVariant(variantId, setLoading, setError, setVariants, loadGroups)}
              />
            ))}
          </div>
        </div>
      )}

      {chosenBase && (
        <div style={{ marginBottom: '3rem' }}>
          <h2 style={{ color: '#00ff00', marginBottom: '1rem' }}>Step 3: Publish Approved Base</h2>
          <PublishBaseSection
            chosenBase={chosenBase}
            loading={loading}
            onPublish={() => publishAsset(chosenBase.id, undefined, setLoading, setError, loadAssets, selectedEntry)}
          />
        </div>
      )}
    </div>
  );
}
