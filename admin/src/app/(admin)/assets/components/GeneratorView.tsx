'use client';

import { useState } from 'react';
import type { Category } from '../constants';
import { API_BASE } from '../constants';
import type { AssetBase, AssetVariant, AssetListAllResponse } from '@las-flores/shared';
import { adminFetch } from '@/lib/client-api';
import BasesSection from './BasesSection';
import VariantCard from './VariantCard';
import VariantForm from './VariantForm';
import PublishBaseSection from './PublishBaseSection';
import GeneratorHeader from './GeneratorHeader';
import styles from '../assets.module.css';

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
  loadGroups: () => Promise<void>;
  loadAssets: (prompt_rel: string) => Promise<void>;
};

async function deleteBase(baseId: string, setLoading: (v: boolean) => void, setError: (v: string | null) => void, setBases: (v: AssetBase[] | ((prev: AssetBase[]) => AssetBase[])) => void, setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void, loadGroups: () => Promise<void>) {
  if (!confirm('Are you sure? This will also delete all variants.')) return;
  setLoading(true);
  try {
    const data = await adminFetch<{ success: boolean; error?: string }>(
      `${API_BASE}/bases/${baseId}`,
      { method: 'DELETE' },
    );
    if (data.success) {
      setBases(prev => prev.filter(b => b.id !== baseId));
      setVariants(prev => prev.filter(v => v.base_id !== baseId));
      await loadGroups();
    } else {
      setError(data.error || 'Failed to delete base');
    }
  } catch {
    setError('Failed to delete base');
  } finally {
    setLoading(false);
  }
}

async function approveBase(baseId: string, setLoading: (v: boolean) => void, setError: (v: string | null) => void, setBases: (v: AssetBase[] | ((prev: AssetBase[]) => AssetBase[])) => void) {
  setLoading(true);
  try {
    const data = await adminFetch<{ success: boolean }>(
      `${API_BASE}/approve-base`,
      {
        method: 'POST',
        body: JSON.stringify({ base_id: baseId }),
      },
    );
    if (data.success) {
      setBases(prev => prev.map(b => ({ ...b, chosen: b.id === baseId })));
    }
  } catch {
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
    const data = await adminFetch<{ success: boolean; data?: AssetVariant[]; error?: string }>(
      `${API_BASE}/generate-variants`,
      {
        method: 'POST',
        body: JSON.stringify({
          base_id: baseId,
          variants: [{
            variant_name: variantName,
            prompt: variantPrompt,
            i2i_strength: i2iStrength,
            negative_prompt: variantNegative || undefined,
          }],
        }),
      },
    );
    if (data.success) {
      setVariants(prev => [...prev, ...(data.data ?? [])]);
      setVariantName('');
      setVariantPrompt('');
      setVariantNegative('');
    } else {
      setError(data.error || 'Failed to generate variant');
    }
  } catch {
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

    const data = await adminFetch<{ success: boolean; data?: AssetVariant[]; error?: string }>(
      `${API_BASE}/generate-variants`,
      {
        method: 'POST',
        body: JSON.stringify({
          base_id: baseId,
          variants: payloadVariants,
        }),
      },
    );
    if (data.success) {
      setVariants(prev => [...prev, ...(data.data ?? [])]);
    } else {
      setError(data.error || 'Failed to generate all variants');
    }
  } catch {
    setError('Failed to generate all variants');
  } finally {
    setLoading(false);
  }
}

async function deleteVariant(variantId: string, setLoading: (v: boolean) => void, setError: (v: string | null) => void, setVariants: (v: AssetVariant[] | ((prev: AssetVariant[]) => AssetVariant[])) => void, loadGroups: () => Promise<void>) {
  if (!confirm('Are you sure?')) return;
  setLoading(true);
  try {
    const data = await adminFetch<{ success: boolean; error?: string }>(
      `${API_BASE}/variants/${variantId}`,
      { method: 'DELETE' },
    );
    if (data.success) {
      setVariants(prev => prev.filter(v => v.id !== variantId));
      await loadGroups();
    } else {
      setError(data.error || 'Failed to delete variant');
    }
  } catch {
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
    const data = await adminFetch<{ success: boolean; data?: AssetBase[]; error?: string }>(
      `${API_BASE}/generate-bases`,
      {
        method: 'POST',
        body: JSON.stringify({ prompt_rel: selectedEntry.prompt_rel, count: 4 }),
      },
    );
    if (data.success) {
      setBases(prev => [...prev, ...(data.data ?? [])]);
      setNewBaseIds(prev => {
        const newIds = new Set(prev);
        (data.data ?? []).forEach((base) => newIds.add(base.id));
        return newIds;
      });
      await loadGroups();
    } else {
      setError(data.error || 'Failed to generate bases');
    }
  } catch {
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
    const data = await adminFetch<{ success: boolean; error?: string }>(
      `${API_BASE}/import-drafts?prompt_rel=${encodeURIComponent(selectedEntry.prompt_rel)}`,
    );
    if (data.success) {
      await loadAssets(selectedEntry.prompt_rel);
      await loadGroups();
    } else {
      setError(data.error || 'Failed to import local drafts');
    }
  } catch {
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
      await adminFetch(`${API_BASE}/bases/${base.id}`, { method: 'DELETE' });
    }
    setBases([]);
    setVariants([]);
    setNewBaseIds(new Set());
    await loadGroups();
  } catch {
    setError('Failed to delete all bases');
  } finally {
    setLoading(false);
  }
}

async function publishAsset(baseId: string | undefined, variantId: string | undefined, setLoading: (v: boolean) => void, setError: (v: string | null) => void, loadAssets: (prompt_rel: string) => Promise<void>, selectedEntry: Category['entries'][0]) {
  setLoading(true);
  setError(null);
  try {
    const data = await adminFetch<{ success: boolean; data?: { url: string }; error?: string }>(
      `${API_BASE}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({ base_id: baseId, variant_id: variantId }),
      },
    );
    if (data.success) {
      alert(`Published to: ${data.data?.url}`);
      await loadAssets(selectedEntry.prompt_rel);
    } else {
      setError(data.error || 'Failed to publish');
    }
  } catch {
    setError('Failed to publish');
  } finally {
    setLoading(false);
  }
}

export default function GeneratorView({
  selectedEntry,
  bases,
  variants,
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
        newBaseIds={newBaseIds}
        loading={loading}
        onDeleteAll={() => deleteAllBases(bases, setLoading, setError, setBases, setVariants, setNewBaseIds, loadGroups)}
        onGenerate={() => generateBases({ selectedEntry, setLoading, setError, setBases, setNewBaseIds, loadGroups })}
        onImport={() => importLocalDrafts({ selectedEntry, setLoading, setError, loadAssets, loadGroups })}
        onDeleteBase={(baseId) => deleteBase(baseId, setLoading, setError, setBases, setVariants, loadGroups)}
        onApproveBase={(baseId) => approveBase(baseId, setLoading, setError, setBases)}
        error={error}
        setError={setError}
      />

      {chosenBase && (
        <div style={{ marginBottom: '3rem' }}>
          <h2 className={styles.sectionTitle}>Step 2: Generate Variants (i2i)</h2>
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

          <h3 className={styles.sectionTitle}>Generated Variants</h3>
          <div className={styles.variantGrid}>
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
          <h2 className={styles.sectionTitle}>Step 3: Publish Approved Base</h2>
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
