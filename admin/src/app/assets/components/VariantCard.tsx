"use client";

import type { AssetVariant } from '../page';

type Props = {
  variant: AssetVariant;
  loading: boolean;
  onPublish: (variantId: string) => void;
  onDelete: (variantId: string) => void;
};

export default function VariantCard({ variant, loading, onPublish, onDelete }: Props) {
  return (
    <div style={{ border: '1px solid #444', padding: '1rem', borderRadius: '5px' }}>
      <img
        src={`/assets/image/${variant.id}`}
        alt={variant.variant_name}
        style={{ width: '100%', height: 'auto', marginBottom: '1rem', borderRadius: '3px' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold' }}>{variant.variant_name}</span>
        <span style={{ fontSize: '0.8rem', color: '#888' }}>strength: {variant.i2i_strength?.toFixed(2) || '0.70'}</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          onClick={() => onPublish(variant.id)}
          disabled={loading}
          style={{ flex: 1, padding: '0.4rem 0.8rem', background: 'transparent', color: '#00ff00', border: '1px solid #00ff00', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          Publish
        </button>
        <button
          onClick={() => onDelete(variant.id)}
          disabled={loading}
          style={{ padding: '0.4rem 0.8rem', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
