"use client";

import type { Category } from '../page';

type Props = {
  selectedEntry: Category['entries'][0];
  onBack: () => void;
};

export default function GeneratorHeader({ selectedEntry, onBack }: Props) {
  return (
    <div>
      <button
        onClick={onBack}
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
    </div>
  );
}
