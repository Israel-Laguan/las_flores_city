'use client';

import type { AssetBase } from '@las-flores/shared';
import { serverAssetUrl } from '@/lib/client-api';
import styles from '../assets.module.css';

type Props = {
  chosenBase: AssetBase;
  loading: boolean;
  onPublish: () => void;
};

export default function PublishBaseSection({ chosenBase, loading, onPublish }: Props) {
  return (
    <div className={styles.publishSection}>
      <img
        src={serverAssetUrl(`/assets/image/${chosenBase.id}`)}
        alt="chosen base"
        className={styles.cardImage}
      />
      <button
        onClick={onPublish}
        disabled={loading}
        className={styles.btnPrimary}
        style={{ width: '100%' }}
      >
        Publish Base to MinIO
      </button>
    </div>
  );
}
