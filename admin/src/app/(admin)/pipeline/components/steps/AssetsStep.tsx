'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@las-flores/ui';
import type { PipelineAssetCoverage, EntityRow, SetDefaultState } from '../../hooks/usePipeline';
import CoverageTable from './CoverageTable';
import styles from '../../pipeline.module.css';

interface Props {
  assetCoverage: PipelineAssetCoverage | null;
  loading: boolean;
  onFetch: () => void;
}

export default function AssetsStep({ assetCoverage, loading, onFetch }: Props) {
  const initialFetchRef = useRef(false);
  const [setDefaultStates, setSetDefaultStates] = useState<Record<string, SetDefaultState>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!assetCoverage && !loading && !initialFetchRef.current) {
      initialFetchRef.current = true;
      onFetch();
    }
  }, [assetCoverage, loading, onFetch]);

  const handleSetDefault = useCallback(async (row: EntityRow, url: string) => {
    const slug = row.item.slug;
    const stateKey = `${row.kind}:${slug}`;
    setSetDefaultStates(prev => ({ ...prev, [stateKey]: { saving: true, error: null, success: false } }));
    try {
      const { adminFetch } = await import('@/lib/client-api');
      await adminFetch('/admin/content/assign-asset', {
        method: 'POST',
        body: JSON.stringify({
          contentPath: `${row.kind}s/${slug}/${row.kind === 'character' ? 'char_' : 'scene_'}${slug}.yaml`,
          fieldPath: row.kind === 'character' ? 'portrait_urls[0].url' : 'background_url',
          assetUrl: url,
        }),
      });
      setSetDefaultStates(prev => ({ ...prev, [stateKey]: { saving: false, error: null, success: true } }));
      timersRef.current[stateKey] = setTimeout(() => {
        setSetDefaultStates(prev => ({ ...prev, [stateKey]: { saving: false, error: null, success: false } }));
        onFetch();
        delete timersRef.current[stateKey];
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set default';
      setSetDefaultStates(prev => ({ ...prev, [stateKey]: { saving: false, error: msg, success: false } }));
    }
  }, [onFetch]);

  const rows: EntityRow[] = [
    ...(assetCoverage?.characters ?? []).map(item => ({ kind: 'character' as const, item })),
    ...(assetCoverage?.scenes ?? []).map(item => ({ kind: 'scene' as const, item })),
  ];

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
          <CoverageTable
            rows={rows}
            setDefaultStates={setDefaultStates}
            onSetDefault={handleSetDefault}
          />
        </div>
      )}

      {!loading && assetCoverage === null && (
        <p className={styles.muted}>Click <strong>Refresh Coverage</strong> to check asset status.</p>
      )}
    </div>
  );
}
