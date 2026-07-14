'use client';

import { useAssetCoverage } from './hooks/useAssetCoverage';
import SummaryCards from './components/SummaryCards';
import AssetTable from './components/AssetTable';
import styles from './asset-coverage.module.css';

export default function AssetCoveragePage() {
  const { loading, error, charsMissing, charsReady, scenesMissing, scenesReady } = useAssetCoverage();

  return (
    <main className={styles.main}>
      <h1>Asset Coverage</h1>

      {loading && <p className={styles.muted}>Loading...</p>}
      {error && <div className={styles.errorBox}>{error}</div>}

      {!loading && !error && (
        <>
          <SummaryCards
            charsReady={charsReady.length}
            charsMissing={charsMissing.length}
            scenesReady={scenesReady.length}
            scenesMissing={scenesMissing.length}
          />

          <AssetTable
            title="Characters — Portrait Status"
            headers={['Name', 'Status', 'Preview', 'Action']}
            rows={[
              ...charsMissing.map((c) => ({ id: c.id, name: c.name, status: 'missing' as const, linkHref: `/characters/${c.id}` })),
              ...charsReady.map((c) => ({ id: c.id, name: c.name, status: 'ready' as const, previewUrl: c.portraitUrls[0], linkHref: `/characters/${c.id}` })),
            ]}
          />

          <AssetTable
            title="Scenes — Background Status"
            headers={['Name', 'Status', 'Preview', 'Action']}
            rows={[
              ...scenesMissing.map((s) => ({ id: s.id, name: s.name, status: 'missing' as const, linkHref: `/scenes/${s.id}` })),
              ...scenesReady.map((s) => ({ id: s.id, name: s.name, status: 'ready' as const, previewUrl: s.backgroundUrl ?? undefined, previewStyle: { width: '60px', height: '34px', borderRadius: '4px', objectFit: 'cover' } as React.CSSProperties, linkHref: `/scenes/${s.id}` })),
            ]}
          />
        </>
      )}
    </main>
  );
}
