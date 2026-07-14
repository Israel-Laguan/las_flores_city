'use client';

import type { AssetListAllResponse } from '@las-flores/shared';
import type { Category } from '../constants';
import { API_BASE } from '../constants';
import { adminFetch } from '@/lib/client-api';
import styles from '../assets.module.css';

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
    const data = await adminFetch<{ success: boolean; data: { imported: { bases: number; variants: number }; errors?: unknown[]; details?: Array<{ error?: string }> }; error?: string }>(
      `${API_BASE}/import-drafts?all=true`,
    );
    if (data.success) {
      const { bases, variants } = data.data.imported;
      const errorCount = data.data.errors?.length || 0;
      const totalProcessed = data.data.details?.length || 0;
      const skippedCount = data.data.details?.filter((d) => d.error === 'Already exists, skipped').length || 0;

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
      setError(data.error || 'Failed to bulk import drafts');
    }
  } catch {
    setError('Failed to bulk import drafts');
  } finally {
    setLoading(false);
  }
}

export default function CatalogView({ categories, groups, loading, setLoading, setError, loadGroups, onSelectEntry }: Props) {
  return (
    <div>
      <div className={styles.headerBar}>
        <h2 className={styles.sectionTitle}>What do you want to create?</h2>
        <button
          onClick={() => bulkImport({ setLoading, setError, loadGroups })}
          disabled={loading}
          className={styles.btnSecondary}
          style={{ fontSize: '0.8rem' }}
        >
          Import All Local Drafts
        </button>
      </div>
      <div className={styles.catalogGrid}>
        {categories.map(cat => (
          <div key={cat.id} className={styles.categoryCard}>
            <h3 className={styles.categoryTitle}>{cat.icon} {cat.label}</h3>
            <div className={styles.entryList}>
              {cat.entries.map(entry => {
                const group = groups.find((g) => g.prompt_rel === entry.prompt_rel);
                return (
                  <button
                    key={entry.prompt_rel}
                    onClick={() => onSelectEntry(entry)}
                    className={styles.entryBtn}
                  >
                    <div className={styles.entryBtnName}>{entry.name}</div>
                    <div className={styles.entryBtnMeta}>
                      {entry.asset_type} &middot; {entry.dimensions.width}&times;{entry.dimensions.height}
                      {group && ` \u00b7 ${group.base_count} bases, ${group.variant_count} variants`}
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
