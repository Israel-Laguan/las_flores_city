"use client";

import type { AssetBase } from '../page';

type Props = {
  base: AssetBase;
  isNew: boolean;
  loading: boolean;
  onDelete: (baseId: string) => void;
  onApprove: (baseId: string) => void;
};

export default function BaseCard({ base, isNew, loading, onDelete, onApprove }: Props) {
  const borderColor = base.chosen ? '#00ff00' : isNew ? '#00aaff' : '#444';

  return (
    <div style={{ border: `2px solid ${borderColor}`, padding: '1rem', borderRadius: '5px', position: 'relative' }}>
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
          onClick={() => onDelete(base.id)}
          disabled={loading}
          style={{ background: 'transparent', color: '#ff4444', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          Delete
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {!base.chosen && (
          <button
            onClick={() => onApprove(base.id)}
            disabled={loading}
            style={{ background: 'transparent', color: '#00ff00', border: '1px solid #00ff00', cursor: 'pointer', fontSize: '0.8rem', padding: '0.4rem 1rem', width: '100%' }}
          >
            Approve
          </button>
        )}
      </div>
    </div>
  );
}
