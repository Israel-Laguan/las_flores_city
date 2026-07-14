'use client';

import styles from './TreePanel.module.css';
import { cn } from '@las-flores/ui';

interface LoreFileEntry {
  path: string;
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
}

interface TreePanelProps {
  treeLoading: boolean;
  filteredGroups: Record<string, LoreFileEntry[]>;
  expandedTypes: Set<string>;
  selectedPath: string | null;
  onToggleType: (type: string) => void;
  onSelectFile: (path: string) => void;
}

function FileTree({ files, expanded, selectedPath, onToggleType, onSelectFile }: {
  files: Record<string, LoreFileEntry[]>;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggleType: (type: string) => void;
  onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {Object.entries(files).map(([type, typeFiles]) => (
        <div key={type} className={styles.typeGroup}>
          <button
            onClick={() => onToggleType(type)}
            className={styles.typeButton}
          >
            <span className={styles.expandIcon}>{expanded.has(type) ? '▼' : '▶'}</span>
            <span className={styles.typeName}>{type}</span>
            <span className={styles.typeCount}>{typeFiles.length}</span>
          </button>
          {expanded.has(type) && (
            <div className={styles.fileList}>
              {typeFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onSelectFile(file.path)}
                  className={cn(styles.fileButton, selectedPath === file.path && styles.fileButtonActive)}
                >
                  {file.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

export default function TreePanel({
  treeLoading,
  filteredGroups,
  expandedTypes,
  selectedPath,
  onToggleType,
  onSelectFile,
}: TreePanelProps) {
  return (
    <div className={styles.container}>
      <div className={styles.scrollArea}>
        {treeLoading && <p className={styles.muted}>Loading...</p>}
        {!treeLoading && Object.keys(filteredGroups).length === 0 && (
          <p className={styles.muted}>No files found.</p>
        )}
        <FileTree
          files={filteredGroups}
          expanded={expandedTypes}
          selectedPath={selectedPath}
          onToggleType={onToggleType}
          onSelectFile={onSelectFile}
        />
      </div>
    </div>
  );
}
