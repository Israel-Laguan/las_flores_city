"use client";

import { useState, useEffect } from 'react';
import type { AssetBase, AssetVariant, AssetListAllResponse } from '@las-flores/shared';
import CatalogView from './components/CatalogView';
import GeneratorView from './components/GeneratorView';

const API_BASE = '/assets';

type Category = {
  id: string;
  label: string;
  icon: string;
  entries: Array<{
    prompt_rel: string;
    name: string;
    category: string;
    asset_type: string;
    dimensions: { width: number; height: number };
    prompt_file: string;
    variants: Array<{ name: string; prompt: string; negative_prompt?: string }>;
  }>;
};

type View = 'catalog' | 'generator';

export type { Category, View };
export { API_BASE };

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

async function loadAssets(
  setLoading: (v: boolean) => void,
  setError: (v: string | null) => void,
  setBases: (v: AssetBase[]) => void,
  setVariants: (v: AssetVariant[]) => void,
  prompt_rel: string
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

export default function AssetsPage() {
  const [view, setView] = useState<View>('catalog');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<Category['entries'][0] | null>(null);
  const [bases, setBases] = useState<AssetBase[]>([]);
  const [variants, setVariants] = useState<AssetVariant[]>([]);
  const [groups, setGroups] = useState<AssetListAllResponse['groups']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBaseIds, setNewBaseIds] = useState<Set<string>>(new Set());

  async function loadGroups() {
    try {
      const res = await fetch(`${API_BASE}/list-all`);
      const data = await res.json();
      if (data.success) {
        setGroups(data.data.groups);
      }
    } catch (e) {
      console.error('Failed to load groups', e);
    }
  }

  useEffect(() => {
    loadCatalog(setLoading, setCategories, setError);
    loadGroups();
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
          loadGroups={loadGroups}
          onSelectEntry={entry => {
            setSelectedEntry(entry);
            setView('generator');
            loadAssets(setLoading, setError, setBases, setVariants, entry.prompt_rel);
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
          loadGroups={loadGroups}
          loadAssets={loadAssets}
        />
      )}
    </main>
  );
}
