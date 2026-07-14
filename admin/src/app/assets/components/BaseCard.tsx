'use client';

import type { AssetBase } from '@las-flores/shared';
import { serverAssetUrl } from '@/lib/client-api';
import styles from '../assets.module.css';

type Props = {
  base: AssetBase;
  isNew: boolean;
  loading: boolean;
  onDelete: (baseId: string) => void;
  onApprove: (baseId: string) => void;
};

export default function BaseCard({ base, isNew, loading, onDelete, onApprove }: Props) {
  const cardClass = base.chosen
    ? `${styles.card} ${styles.cardChosen}`
    : isNew
      ? `${styles.card} ${styles.cardNew}`
      : styles.card;

  return (
    <div className={cardClass}>
      {isNew && !base.chosen && <div className={styles.badgeNew}>NEW</div>}
      {base.chosen && <div className={styles.badgeChosen}>&check; Chosen</div>}
      <img
        src={serverAssetUrl(`/assets/image/${base.id}`)}
        alt="base proposal"
        className={styles.cardImage}
      />
      <div className={styles.cardMeta}>
        <span className={styles.muted}>#{base.proposal_index + 1} &middot; seed {base.seed}</span>
        <button
          onClick={() => onDelete(base.id)}
          disabled={loading}
          className={styles.btnSmallDanger}
        >
          Delete
        </button>
      </div>
      <div className={styles.cardActions}>
        {!base.chosen && (
          <button
            onClick={() => onApprove(base.id)}
            disabled={loading}
            className={styles.btnSmallFull}
          >
            Approve
          </button>
        )}
      </div>
    </div>
  );
}
