"use client";

import { useState, useEffect } from 'react';
import type { AssetBase, AssetVariant, PromptCatalogResponse, AssetListAllResponse } from '@las-flores/shared';

const API_BASE = 'http://localhost:3000/assets';

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

  // Variant generation form state
  const [variantName, setVariantName] = useState('');
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantNegative, setVariantNegative] = useState('');
  const [i2iStrength, setI2iStrength] = useState(0.7);

  useEffect(() => {
    loadCatalog();
    loadGroups();
  }, []);

  const loadCatalog = async () => {
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
  };

  const loadGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/list-all`);
      const data = await res.json();
      if (data.success) {
        setGroups(data.data.groups as AssetListAllResponse['groups']);
      }
    } catch (e) {
      console.error('Failed to load groups', e);
    }
  };

  const loadAssets = async (prompt_rel: string) => {
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
  };

  const generateBases = async () => {
    if (!selectedEntry) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/generate-bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_rel: selectedEntry.prompt_rel,
          count: 4,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const newIds = data.data.map((b: any) => b.id);
        setNewBaseIds(prev => new Set([...prev, ...newIds]));
        setBases(prev => [...prev, ...data.data]);
        await loadGroups();
      } else {
        setError(data.error || 'Failed to generate bases');
      }
    } catch (e) {
      setError('Failed to generate bases');
    } finally {
      setLoading(false);
    }
  };

  const importLocalDrafts = async () => {
    if (!selectedEntry) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/import-drafts?prompt_rel=${encodeURIComponent(selectedEntry.prompt_rel)}`);
      const data = await res.json();
      if (data.success) {
        await loadAssets(selectedEntry.prompt_rel);
        await loadGroups();
        alert(`Imported ${data.data.imported.bases} bases and ${data.data.imported.variants} variants`);
      } else {
        setError(data.error || 'Failed to import drafts');
      }
    } catch (e) {
      setError('Failed to import drafts');
    } finally {
      setLoading(false);
    }
  };

  const approveBase = async (baseId: string) => {
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
  };

  const generateVariant = async (baseId: string) => {
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
  };

  const generateAllVariants = async (baseId: string) => {
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
        i2i_strength: 0.7, // default strength for batch
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
  };

  const deleteBase = async (baseId: string) => {
    if (!confirm('Are you sure? This will also delete all variants.')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/bases/${baseId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setBases(prev => prev.filter(b => b.id !== baseId));
        setVariants(prev => prev.filter(v => v.base_id !== baseId));
        await loadGroups();
      } else {
        setError(data.error || 'Failed to delete base');
      }
    } catch (e) {
      setError('Failed to delete base');
    } finally {
      setLoading(false);
    }
  };

  const deleteVariant = async (variantId: string) => {
    if (!confirm('Are you sure?')) return;
    setLoading(true);
    setError(null);
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
  };
  
  const deleteAllBases = async () => {
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
  };

  const publishAsset = async (baseId?: string, variantId?: string) => {
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
        await loadAssets(selectedEntry!.prompt_rel);
      } else {
        setError(data.error || 'Failed to publish');
      }
    } catch (e) {
      setError('Failed to publish');
    } finally {
      setLoading(false);
    }
  };

  const selectEntry = async (entry: Category['entries'][0]) => {
    setSelectedEntry(entry);
    setView('generator');
    await loadAssets(entry.prompt_rel);
    // Pre-fill variant form with first non-base variant if available
    const firstVariant = entry.variants.find(v => !v.name.toLowerCase().includes('base'));
    if (firstVariant) {
      setVariantName(firstVariant.name);
      setVariantPrompt(firstVariant.prompt);
      setVariantNegative(firstVariant.negative_prompt || '');
    }
  };

  const chosenBase = bases.find(b => b.chosen);

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ color: '#00ff00', marginBottom: '2rem' }}>Asset Generation Pipeline</h1>

      {error && (
        <div style={{ background: '#ff0000', color: '#fff', padding: '1rem', marginBottom: '1rem', borderRadius: '5px' }}>
          {error}
        </div>
      )}

      {view === 'catalog' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: '#00ff00', margin: 0 }}>What do you want to create?</h2>
            <button
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const res = await fetch(`${API_BASE}/import-drafts?all=true`);
                  const data = await res.json();
                  if (data.success) {
                    alert(`Bulk imported: ${data.data.imported.bases} bases, ${data.data.imported.variants} variants`);
                    await loadGroups();
                  } else {
                    setError(data.error || 'Failed to bulk import drafts');
                  }
                } catch (e) {
                  setError('Failed to bulk import drafts');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              style={{ padding: '0.5rem 1rem', background: '#00aaff', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold', fontSize: '0.8rem' }}
            >
              📁 Import All Local Drafts
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {categories.map(cat => (
              <div key={cat.id} style={{ border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' }}>
                <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>{cat.icon} {cat.label}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {cat.entries.map(entry => {
                    const group = groups.find((g: AssetListAllResponse['groups'][0]) => g.prompt_rel === entry.prompt_rel);
                    return (
                      <button
                        key={entry.prompt_rel}
                        onClick={() => selectEntry(entry)}
                        style={{
                          background: '#0d0d1a',
                          color: '#00ff00',
                          border: '1px solid #00ff00',
                          padding: '0.75rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'monospace',
                        }}
                      >
                        <div style={{ fontWeight: 'bold' }}>{entry.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>
                          {entry.asset_type} · {entry.dimensions.width}×{entry.dimensions.height}
                          {group && ` · ${group.base_count} bases, ${group.variant_count} variants`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'generator' && selectedEntry && (
        <div>
          <button
            onClick={() => { setView('catalog'); setSelectedEntry(null); }}
            style={{ background: 'transparent', color: '#00ff00', border: '1px solid #00ff00', padding: '0.5rem 1rem', cursor: 'pointer', marginBottom: '1rem' }}
          >
            ← Back to Catalog
          </button>

          <div style={{ marginBottom: '2rem', padding: '1rem', background: '#0d0d1a', border: '1px solid #00ff00', borderRadius: '5px' }}>
            <h2 style={{ color: '#00ff00', marginBottom: '0.5rem' }}>{selectedEntry.name}</h2>
            <div style={{ fontSize: '0.9rem', color: '#888' }}>
              {selectedEntry.asset_type} · {selectedEntry.dimensions.width}×{selectedEntry.dimensions.height} · {selectedEntry.prompt_rel}
            </div>
          </div>

          {/* Step 1: Generate Bases */}
          <div style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ color: '#00ff00', margin: 0 }}>Step 1: Generate Base Proposals</h2>
              <button
                onClick={deleteAllBases}
                disabled={loading || bases.length === 0}
                style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#ff4444', cursor: bases.length === 0 ? 'not-allowed' : 'pointer', border: '1px solid #ff4444', fontWeight: 'bold' }}
              >
                Delete All Bases
              </button>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <button
                onClick={generateBases}
                disabled={loading}
                style={{ padding: '0.75rem 1.5rem', background: '#00ff00', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
              >
                Generate 4 Bases
              </button>
              <button
                onClick={importLocalDrafts}
                disabled={loading}
                style={{ padding: '0.75rem 1.5rem', background: '#00aaff', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
              >
                Import Local Drafts
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              {bases.map(base => {
                const isNew = newBaseIds.has(base.id);
                const borderColor = base.chosen ? '#00ff00' : isNew ? '#00aaff' : '#444';
                
                return (
                <div key={base.id} style={{ border: `2px solid ${borderColor}`, padding: '1rem', borderRadius: '5px', position: 'relative' }}>
                  {isNew && !base.chosen && (
                    <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#00aaff', color: '#000', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' }}>NEW</div>
                  )}
                  {base.chosen && (
                    <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#00ff00', color: '#000', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' }}>✓ Chosen</div>
                  )}
                  <img
                    src={`/assets/image/${base.id}`}
                    alt="base proposal"
                    style={{ width: '100%', height: 'auto', marginBottom: '1rem', borderRadius: '3px' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#888' }}>#{base.proposal_index + 1} · seed {base.seed}</span>
                    <button
                      onClick={() => deleteBase(base.id)}
                      disabled={loading}
                      style={{ background: 'transparent', color: '#ff4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Delete
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {!base.chosen && (
                      <button
                        onClick={() => approveBase(base.id)}
                        disabled={loading}
                        style={{ background: 'transparent', color: '#00ff00', border: '1px solid #00ff00', cursor: 'pointer', fontSize: '0.8rem', padding: '0.4rem 1rem', width: '100%' }}
                      >
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              )})}
            </div>
          </div>

          {/* Step 2: Generate Variants */}
          {chosenBase && (
            <div style={{ marginBottom: '3rem' }}>
              <h2 style={{ color: '#00ff00', marginBottom: '1rem' }}>Step 2: Generate Variants (i2i)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '600px', marginBottom: '1rem' }}>
                <input
                  value={variantName}
                  onChange={e => setVariantName(e.target.value)}
                  placeholder="Variant Name (e.g. night)"
                  style={{ padding: '0.5rem', background: '#0d0d1a', color: '#00ff00', border: '1px solid #00ff00' }}
                />
                <textarea
                  value={variantPrompt}
                  onChange={e => setVariantPrompt(e.target.value)}
                  placeholder="Variant Prompt Text"
                  rows={2}
                  style={{ padding: '0.5rem', background: '#0d0d1a', color: '#00ff00', border: '1px solid #00ff00' }}
                />
                <input
                  value={variantNegative}
                  onChange={e => setVariantNegative(e.target.value)}
                  placeholder="Negative Prompt (optional)"
                  style={{ padding: '0.5rem', background: '#0d0d1a', color: '#00ff00', border: '1px solid #00ff00' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <label style={{ color: '#00ff00' }}>i2i Strength: {i2iStrength.toFixed(2)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={i2iStrength}
                    onChange={e => setI2iStrength(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={() => generateVariant(chosenBase.id)}
                    disabled={loading}
                    style={{ padding: '0.75rem 1.5rem', background: '#00ff00', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
                  >
                    Generate Variant
                  </button>
                  <button
                    onClick={() => generateAllVariants(chosenBase.id)}
                    disabled={loading}
                    style={{ padding: '0.75rem 1.5rem', background: '#00aaff', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
                  >
                    Generate All Variants
                  </button>
                </div>
              </div>

              <h3 style={{ color: '#00ff00', marginBottom: '1rem' }}>Generated Variants</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                {variants.map(v => (
                  <div key={v.id} style={{ border: '1px solid #444', padding: '1rem', borderRadius: '5px' }}>
                    <img
                      src={`/assets/image/${v.id}`}
                      alt={v.variant_name}
                      style={{ width: '100%', height: 'auto', marginBottom: '1rem', borderRadius: '3px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold' }}>{v.variant_name}</span>
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>strength: {v.i2i_strength?.toFixed(2) || '0.70'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={() => publishAsset(undefined, v.id)}
                        disabled={loading}
                        style={{ flex: 1, padding: '0.4rem 0.8rem', background: 'transparent', color: '#00ff00', border: '1px solid #00ff00', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Publish
                      </button>
                      <button
                        onClick={() => deleteVariant(v.id)}
                        disabled={loading}
                        style={{ padding: '0.4rem 0.8rem', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Publish */}
          {chosenBase && (
            <div style={{ marginBottom: '3rem' }}>
              <h2 style={{ color: '#00ff00', marginBottom: '1rem' }}>Step 3: Publish Approved Base</h2>
              <div style={{ border: '1px solid #444', padding: '1rem', borderRadius: '5px', maxWidth: '400px' }}>
                <img
                  src={`/assets/image/${chosenBase.id}`}
                  alt="chosen base"
                  style={{ width: '100%', height: 'auto', marginBottom: '1rem', borderRadius: '3px' }}
                />
                <button
                  onClick={() => publishAsset(chosenBase.id)}
                  disabled={loading}
                  style={{ padding: '0.75rem 1.5rem', background: '#00ff00', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold', width: '100%' }}
                >
                  Publish Base to MinIO
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}