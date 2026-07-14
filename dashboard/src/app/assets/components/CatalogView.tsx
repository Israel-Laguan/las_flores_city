"use client";

import type { AssetListAllResponse } from '@las-flores/shared';
import type { Category } from '../constants';
import { API_BASE } from '../constants';

type Props = {
  categories: Category[];
  groups: AssetListAllResponse['groups'];
  loading: boolean;
  error: string | null;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  loadGroups: () => Promise<void>;
  onSelectEntry: (entry: Category['entries'][0]) => void;
};

async function bulkImport({ setLoading, setError, loadGroups }: Pick<Props, 'setLoading' | 'setError' | 'loadGroups'>) {
  setLoading(true);
  setError(null);
  try {
    console.log('[bulkImport] Starting import...');
    const res = await fetch(`${API_BASE}/import-drafts?all=true`);
    console.log('[bulkImport] Response status:', res.status, res.statusText);
    const data = await res.json();
    console.log('[bulkImport] Response data:', data);
    if (data.success) {
      const { bases, variants } = data.data.imported;
      const errorCount = data.data.errors?.length || 0;
      const totalProcessed = data.data.details?.length || 0;
      const skippedCount = data.data.details?.filter((d: any) => d.error === 'Already exists, skipped').length || 0;
      
      let message: string;
      if (bases > 0 || variants > 0) {
        message = errorCount > 0 
          ? `Imported: ${bases} bases, ${variants} variants (${errorCount} errors)`
          : `Bulk imported: ${bases} bases, ${variants} variants`;
      } else if (skippedCount > 0) {
        message = `All ${skippedCount} drafts already imported (${totalProcessed} total)`;
      } else {
        message = `No drafts found to import`;
      }
      alert(message);
      await loadGroups();
    } else {
      const errorMsg = data.error || 'Failed to bulk import drafts';
      console.error('[bulkImport] API returned error:', errorMsg);
      setError(errorMsg);
    }
  } catch (e) {
    console.error('[bulkImport] Fetch error:', e);
    setError('Failed to bulk import drafts');
  } finally {
    setLoading(false);
  }
}

export default function CatalogView({ categories, groups, loading, error: _error, setLoading, setError, loadGroups, onSelectEntry }: Props) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ color: '#00ff00', margin: 0 }}>What do you want to create?</h2>
        <button
          onClick={() => bulkImport({ setLoading, setError, loadGroups })}
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
                    onClick={() => onSelectEntry(entry)}
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
  );
}
