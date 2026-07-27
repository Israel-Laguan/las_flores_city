'use client';

import type { Category } from '../constants';
import styles from '../assets.module.css';

type Props = {
  selectedEntry: Category['entries'][0];
  onBack: () => void;
};

export default function GeneratorHeader({ selectedEntry, onBack }: Props) {
  return (
    <div>
      <button onClick={onBack} className={styles.catalogBtn}>
        &larr; Back to Catalog
      </button>

      <div className={styles.infoBox}>
        <h2 className={styles.infoBoxTitle}>{selectedEntry.name}</h2>
        <div className={styles.infoBoxMeta}>
          {selectedEntry.asset_type} &middot; {selectedEntry.dimensions.width}&times;{selectedEntry.dimensions.height} &middot; {selectedEntry.prompt_rel}
        </div>
      </div>
    </div>
  );
}
