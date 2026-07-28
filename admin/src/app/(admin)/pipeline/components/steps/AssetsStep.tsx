'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@las-flores/ui';
import styles from '../../pipeline.module.css';
import type { PipelineAssetCoverage } from '../../hooks/usePipeline';

interface Props {
  assetCoverage: PipelineAssetCoverage | null;
  loading: boolean;
  onFetch: () => void;
}

export default function AssetsStep({ assetCoverage, loading, onFetch }: Props) {
  const initialFetchRef = useRef(false);
  useEffect(() => {
    if (!assetCoverage && !loading && !initialFetchRef.current) {
      initialFetchRef.current = true;
      onFetch();
    }
  }, [assetCoverage, loading, onFetch]);

  const charCount = assetCoverage?.characters?.length ?? 0;
  const sceneCount = assetCoverage?.scenes?.length ?? 0;
  const coverageCount = charCount + sceneCount;

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
          className={cn(styles.button, styles.primaryButton, styles.assetLink)}
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
              {assetCoverage.characters.slice(0, 10).map((item: { id: string; name: string; hasPortrait: boolean }) => (
                <li key={item.id} className={styles.coverageItem}>
                  {item.name} {item.hasPortrait ? '✅' : '❌'}
                </li>
              ))}
              {assetCoverage.scenes.slice(0, 10).map((item: { id: string; name: string; hasBackground: boolean }) => (
                <li key={item.id} className={styles.coverageItem}>
                  {item.name} {item.hasBackground ? '✅' : '❌'}
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
