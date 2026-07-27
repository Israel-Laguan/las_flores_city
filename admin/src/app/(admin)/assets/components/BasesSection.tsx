'use client';

import type { AssetBase } from '@las-flores/shared';
import BaseCard from './BaseCard';
import styles from '../assets.module.css';

type Props = {
  bases: AssetBase[];
  newBaseIds: Set<string>;
  loading: boolean;
  error: string | null;
  setError: (v: string | null) => void;
  onDeleteAll: () => void;
  onGenerate: () => void;
  onImport: () => void;
  onDeleteBase: (baseId: string) => void;
  onApproveBase: (baseId: string) => void;
};

export default function BasesSection({ bases, newBaseIds, loading, onDeleteAll, onGenerate, onImport, onDeleteBase, onApproveBase }: Props) {
  return (
    <div style={{ marginBottom: '3rem' }}>
      <div className={styles.sectionHeader}>
        <h2>Step 1: Generate Base Proposals</h2>
        <button
          onClick={onDeleteAll}
          disabled={loading || bases.length === 0}
          className={styles.btnDanger}
        >
          Delete All Bases
        </button>
      </div>
      <div className={styles.btnRow}>
        <button
          onClick={onGenerate}
          disabled={loading}
          className={styles.btnPrimary}
        >
          Generate 4 Bases
        </button>
        <button
          onClick={onImport}
          disabled={loading}
          className={styles.btnSecondary}
        >
          Import Local Drafts
        </button>
      </div>

      <div className={styles.cardGrid}>
        {bases.map(base => (
          <BaseCard
            key={base.id}
            base={base}
            isNew={newBaseIds.has(base.id)}
            loading={loading}
            onDelete={onDeleteBase}
            onApprove={onApproveBase}
          />
        ))}
      </div>
    </div>
  );
}
