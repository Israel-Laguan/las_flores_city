'use client';

import { useEffect } from 'react';
import { cn } from '@las-flores/ui';
import styles from '../../pipeline.module.css';

interface Props {
  assetCoverage: unknown[] | null;
  loading: boolean;
  onFetch: () => void;
}

export default function AssetsStep({ assetCoverage, loading, onFetch }: Props) {
  useEffect(() => {
    if (!assetCoverage) onFetch();
  }, [assetCoverage, onFetch]);

  const coverageCount = Array.isArray(assetCoverage) ? assetCoverage.length : 0;

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>4. Assets</h2>
      <p className={styles.stepDescription}>
        Review asset coverage and ensure images are generated.
        Deep-link to the full asset generation page for detailed work.
      </p>

      <div className={styles.buttonBar}>
        <button
          onClick={onFetch}
          disabled={loading}
          className={cn(styles.button, loading ? styles.disabledButton : styles.secondaryButton)}
        >
          {loading ? 'Loading...' : 'Refresh Coverage'}
        </button>
        <a
          href="/assets"
          className={cn(styles.button, styles.primaryButton)}
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          Open Asset Generation →
        </a>
      </div>

      {loading && <p className={styles.muted}>Loading asset coverage...</p>}

      {!loading && assetCoverage !== null && (
        <div className={styles.resultSection}>
          <div className={styles.coverageSummary}>
            <strong>{coverageCount}</strong> entities tracked in asset coverage
          </div>
          {coverageCount > 0 ? (
            <ul className={styles.coverageList}>
              {Array.isArray(assetCoverage) && assetCoverage.slice(0, 20).map((item: any, i: number) => (
                <li key={i} className={styles.coverageItem}>
                  {item?.name || item?.slug || `Entity ${i + 1}`}
                  {item?.hasDefaultAsset ? ' ✅' : ' ❌'}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>No asset coverage data available.</p>
          )}
        </div>
      )}

      {!loading && assetCoverage === null && (
        <p className={styles.muted}>Click <strong>Refresh Coverage</strong> to check asset status.</p>
      )}
    </div>
  );
}
