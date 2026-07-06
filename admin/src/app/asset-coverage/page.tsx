"use client";

import { adminStyles as styles } from '@/lib/adminStyles';
import { useAssetCoverage } from './hooks/useAssetCoverage';
import SummaryCards from './components/SummaryCards';
import AssetTable from './components/AssetTable';

export default function AssetCoveragePage() {
  const { loading, error, charsMissing, charsReady, scenesMissing, scenesReady } = useAssetCoverage();

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>Asset Coverage</h1>

      {loading && <p style={styles.muted}>Loading...</p>}
      {error && <div style={styles.errorBox}>{error}</div>}

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