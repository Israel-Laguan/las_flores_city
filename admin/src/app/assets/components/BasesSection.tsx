"use client";

import type { AssetBase, AssetListAllResponse } from '../page';
import BaseCard from './BaseCard';

type Props = {
  bases: AssetBase[];
  groups: AssetListAllResponse['groups'];
  newBaseIds: Set<string>;
  loading: boolean;
  onDeleteAll: () => void;
  onGenerate: () => void;
  onImport: () => void;
  onDeleteBase: (baseId: string) => void;
  onApproveBase: (baseId: string) => void;
};

export default function BasesSection({ bases, groups, newBaseIds, loading, onDeleteAll, onGenerate, onImport, onDeleteBase, onApproveBase }: Props) {
  return (
    <div style={{ marginBottom: '3rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ color: '#00ff00', margin: 0 }}>Step 1: Generate Base Proposals</h2>
        <button
          onClick={onDeleteAll}
          disabled={loading || bases.length === 0}
          style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#ff4444', cursor: bases.length === 0 ? 'not-allowed' : 'pointer', border: '1px solid #ff4444', fontWeight: 'bold' }}
        >
          Delete All Bases
        </button>
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button
          onClick={onGenerate}
          disabled={loading}
          style={{ padding: '0.75rem 1.5rem', background: '#00ff00', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
        >
          Generate 4 Bases
        </button>
        <button
          onClick={onImport}
          disabled={loading}
          style={{ padding: '0.75rem 1.5rem', background: '#00aaff', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
        >
          Import Local Drafts
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
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
