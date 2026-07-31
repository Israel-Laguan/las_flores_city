'use client';

import { cn } from '@las-flores/ui';
import type { EntityRow, SetDefaultState } from '../../hooks/usePipeline';
import styles from '../../pipeline.module.css';

interface Props {
  rows: EntityRow[];
  setDefaultStates: Record<string, SetDefaultState>;
  onSetDefault: (row: EntityRow, url: string) => void;
}

function hasAsset(row: EntityRow): boolean {
  if (row.kind === 'character') return row.item.hasPortrait;
  return row.item.hasBackground;
}

function previewUrl(row: EntityRow): string | null {
  if (row.kind === 'character') {
    const entries = row.item.portraitUrls;
    return entries.length > 0 ? entries[0].url : null;
  }
  return row.item.backgroundUrl;
}

function CoverageRow({ row, sdState, onSetDefault }: {
  row: EntityRow;
  sdState: SetDefaultState | undefined;
  onSetDefault: (row: EntityRow, url: string) => void;
}) {
  const stateKey = `${row.kind}:${row.item.id}`;
  const preview = previewUrl(row);
  const assetOk = hasAsset(row);

  return (
    <tr key={stateKey} className={assetOk ? styles.rowReady : styles.rowMissing}>
      <td className={styles.td}>
        <span className={cn(styles.typeBadge, row.kind === 'character' ? styles.typeChar : styles.typeScene)}>
          {row.kind === 'character' ? 'Char' : 'Scene'}
        </span>
      </td>
      <td className={styles.td}>
        <a
          href={`/${row.kind}s/${row.item.id}`}
          className={styles.entityLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          {row.item.name}
        </a>
      </td>
      <td className={styles.td}>
        {assetOk ? (
          <span className={styles.statusOk}>✅ Ready</span>
        ) : (
          <span className={styles.statusMissing}>❌ Missing</span>
        )}
      </td>
      <td className={styles.td}>
        {preview ? (
          <img
            src={preview}
            alt={row.item.name}
            className={row.kind === 'character' ? styles.previewPortrait : styles.previewBg}
          />
        ) : (
          <span className={styles.noPreview}>—</span>
        )}
      </td>
      <td className={styles.td}>
        <div className={styles.rowActions}>
          {row.kind === 'character' && row.item.portraitUrls.length > 1 && (
            <select
              className={styles.setDefaultSelect}
              disabled={sdState?.saving}
              value=""
              onChange={(e) => { const url = e.target.value; if (url) onSetDefault(row, url); }}
            >
              <option value="" disabled>
                {sdState?.saving ? 'Setting...' : sdState?.success ? '✓ Set!' : 'Set as Default'}
              </option>
              {row.item.portraitUrls.map((entry, i) => (
                <option key={entry.url} value={entry.url}>Portrait #{i + 1}</option>
              ))}
            </select>
          )}
          {row.kind === 'character' && row.item.portraitUrls.length === 1 && row.item.hasPortrait && (
            <button
              disabled={sdState?.saving}
              className={cn(styles.inlineButton, sdState?.success ? styles.inlineButtonSuccess : '')}
               onClick={() => onSetDefault(row, row.item.portraitUrls[0].url)}
              title="Set this portrait as default in YAML"
            >
              {sdState?.saving ? '...' : sdState?.success ? '✓ Default' : 'Set Default'}
            </button>
          )}
          {row.kind === 'scene' && row.item.hasBackground && row.item.backgroundUrl && (
            <button
              disabled={sdState?.saving}
              className={cn(styles.inlineButton, sdState?.success ? styles.inlineButtonSuccess : '')}
              onClick={() => onSetDefault(row, row.item.backgroundUrl!)}
              title="Set this background as default in YAML"
            >
              {sdState?.saving ? '...' : sdState?.success ? '✓ Default' : 'Set Default'}
            </button>
          )}
          {sdState?.error && (
            <span className={styles.inlineError}>{sdState.error}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function CoverageTable({ rows, setDefaultStates, onSetDefault }: Props) {
  const readyCount = rows.filter(r => hasAsset(r)).length;
  const missingCount = rows.length - readyCount;

  if (rows.length === 0) {
    return <p className={styles.muted}>No asset coverage data available.</p>;
  }

  return (
    <>
      <div className={styles.coverageSummary}>
        <span className={styles.coverageStat}><strong>{rows.length}</strong> entities</span>
        <span className={styles.coverageStat}><strong className={styles.statReady}>{readyCount}</strong> with assets</span>
        <span className={styles.coverageStat}><strong className={styles.statMissing}>{missingCount}</strong> missing assets</span>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Entity</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Preview</th>
            <th className={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <CoverageRow
              key={`${row.kind}:${row.item.id}`}
              row={row}
               sdState={setDefaultStates[`${row.kind}:${row.item.slug}`]}
              onSetDefault={onSetDefault}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}
