"use client";

import { useState, useEffect } from 'react';
import type { AssetBase, AssetVariant, AssetListAllResponse } from '@las-flores/shared';
import { API_BASE } from './constants';
import type { Category, View } from './constants';
import CatalogView from './components/CatalogView';
import GeneratorView from './components/GeneratorView';
import { loadGroups as sharedLoadGroups } from '@/lib/hooks/useAssetsApi';

async function loadCatalog(
  setLoading: (v: boolean) => void,
  setCategories: (v: Category[]) => void,
  setError: (v: string | null) => void
) {
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/prompt-catalog`);
    const data = await res.json();
    if (data.success) {
      setCategories(data.data.categories);
    }
  } catch (e) {
    setError('Failed to load prompt catalog');
  } finally {
    setLoading(false);
  }
}

async function handleLoadAssets(
  prompt_rel: string,
  setLoading: (v: boolean) => void,
  setError: (v: string | null) => void,
  setBases: (v: AssetBase[]) => void,
  setVariants: (v: AssetVariant[]) => void
) {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`${API_BASE}/list?prompt_rel=${encodeURIComponent(prompt_rel)}`);
    const data = await res.json();
    if (data.success) {
      setBases(data.data.bases);
      setVariants(data.data.variants);
    }
  } catch (e) {
    setError('Failed to load assets');
  } finally {
    setLoading(false);
  }
}

async function loadGroups(setGroups: (v: AssetListAllResponse['groups']) => void, setError?: (v: string | null) => void) {
  await sharedLoadGroups(setGroups, setError);
}

export default function AssetsPage() {
  const [view, setView] = useState<View>('catalog');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Category['entries'][0] | null>(null);
  const [bases, setBases] = useState<AssetBase[]>([]);
  const [variants, setVariants] = useState<AssetVariant[]>([]);
  const [groups, setGroups] = useState<AssetListAllResponse['groups']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBaseIds, setNewBaseIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCatalog(setLoading, setCategories, setError);
    loadGroups(setGroups, setError);
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ color: '#00ff00', marginBottom: '2rem' }}>Asset Generation Pipeline</h1>

      {error && (
        <div style={{ background: '#ff0000', color: '#fff', padding: '1rem', marginBottom: '1rem', borderRadius: '5px' }}>
          {error}
        </div>
      )}

      {view === 'catalog' && (
        <CatalogView
          categories={categories}
          groups={groups}
          loading={loading}
          error={error}
          setLoading={setLoading}
          setError={setError}
          loadGroups={() => loadGroups(setGroups, setError)}
          onSelectEntry={entry => {
            setSelectedEntry(entry);
            setView('generator');
            handleLoadAssets(entry.prompt_rel, setLoading, setError, setBases, setVariants);
          }}
        />
      )}

      {view === 'generator' && selectedEntry && (
        <GeneratorView
          selectedEntry={selectedEntry}
          bases={bases}
          variants={variants}
          groups={groups}
          newBaseIds={newBaseIds}
          loading={loading}
          error={error}
          setError={setError}
          setLoading={setLoading}
          setBases={setBases}
          setVariants={setVariants}
          setNewBaseIds={setNewBaseIds}
          setView={setView}
          setSelectedEntry={setSelectedEntry}
          loadGroups={() => loadGroups(setGroups, setError)}
          loadAssets={(prompt_rel) => handleLoadAssets(prompt_rel, setLoading, setError, setBases, setVariants)}
        />
      )}
    </main>
  );
}
