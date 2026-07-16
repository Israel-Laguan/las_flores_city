'use client';

import { useAssetPromotion } from './hooks/useAssetPromotion';
import PromotionRow from './components/PromotionRow';
import styles from './asset-promotion.module.css';

export default function AssetPromotionPage() {
  const { statuses, loading, error, promoteStaging, promoteProduction, rollbackStaging } = useAssetPromotion();

  return (
    <main className={styles.main}>
      <h1>Asset Promotion</h1>
      <p className={styles.subtitle}>Manage dev → staging → production cascade for character portraits.</p>

      {loading && <p className={styles.muted}>Loading...</p>}
      {error && <div className={styles.errorBox}>{error}</div>}

      {!loading && !error && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Character</th>
              <th className={styles.th}>Dev</th>
              <th className={styles.th}>Staging</th>
              <th className={styles.th}>Production</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((s) => (
              <PromotionRow
                key={s.contentPath}
                status={s}
                onPromoteStaging={promoteStaging}
                onPromoteProduction={promoteProduction}
                onRollbackStaging={rollbackStaging}
              />
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}