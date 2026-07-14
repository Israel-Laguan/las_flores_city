'use client';

import type { AssetVariant } from '@las-flores/shared';
import { serverAssetUrl } from '@/lib/client-api';
import styles from '../assets.module.css';

type Props = {
  variant: AssetVariant;
  loading: boolean;
  onPublish: (variantId: string) => void;
  onDelete: (variantId: string) => void;
};

export default function VariantCard({ variant, loading, onPublish, onDelete }: Props) {
  return (
    <div className={styles.card}>
      <img
        src={serverAssetUrl(`/assets/image/${variant.id}`)}
        alt={variant.variant_name}
        className={styles.cardImage}
      />
      <div className={styles.cardMeta}>
        <span style={{ fontWeight: 'bold' }}>{variant.variant_name}</span>
        <span className={styles.muted}>strength: {variant.i2i_strength?.toFixed(2) || '0.70'}</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          onClick={() => onPublish(variant.id)}
          disabled={loading}
          className={styles.btnSmallPrimary}
          style={{ flex: 1 }}
        >
          Publish
        </button>
        <button
          onClick={() => onDelete(variant.id)}
          disabled={loading}
          className={styles.btnSmallDanger}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
