'use client';

import { cn } from '@/lib/cn';
import styles from '../editor.module.css';

const TYPE_ICONS: Record<string, string> = {
  character: '👤',
  dialogue: '💬',
  scene: '🗺️',
  mission: '🔍',
  story: '📚',
  overlay: '🔄',
  vault: '🔐',
  gig: '💼',
  shop_item: '🛒',
  map_tile: '🗺️',
  location: '📍',
  story_beat: '📖',
};

interface FileEntry {
  path: string;
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
}

interface Props {
  tree: FileEntry[];
  treeLoading: boolean;
  filter: string;
  selectedPath: string | null;
  expandedTypes: Set<string>;
  dirty: boolean;
  onFilterChange: (v: string) => void;
  onSelect: (path: string) => void;
  onToggleType: (type: string) => void;
}

export default function FileTree({ tree, treeLoading, filter, selectedPath, expandedTypes, dirty, onFilterChange, onSelect, onToggleType }: Props) {
  const filtered = filter
    ? tree.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()) || f.path.toLowerCase().includes(filter.toLowerCase()))
    : tree;

  const grouped: Record<string, FileEntry[]> = {};
  for (const file of filtered) {
    if (!grouped[file.type]) grouped[file.type] = [];
    grouped[file.type].push(file);
  }

  return (
    <div className={styles.treePanel}>
      <div className={styles.treeHeader}>
        <input
          type="text"
          placeholder="Search files..."
          value={filter}
          onChange={e => onFilterChange(e.target.value)}
          className={styles.treeInput}
        />
      </div>
      <div className={styles.treeScroll}>
        {treeLoading ? (
          <p className={cn(styles.muted, styles.treeEmpty)}>Loading...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className={cn(styles.muted, styles.treeEmpty)}>No files found</p>
        ) : (
          Object.entries(grouped).map(([type, files]) => (
            <div key={type} className={styles.typeGroup}>
              <div
                className={styles.typeHeader}
                role="button"
                tabIndex={0}
                onClick={() => onToggleType(type)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleType(type); } }}
              >
                <span>{TYPE_ICONS[type] || '📄'} {type} ({files.length})</span>
                <span className={styles.expandIcon}>{expandedTypes.has(type) ? '▲' : '▼'}</span>
              </div>
              {expandedTypes.has(type) && files.map(file => (
                <div
                  key={file.path}
                  className={cn(styles.fileItem, selectedPath === file.path && styles.fileItemActive)}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (dirty && !confirm('Unsaved changes will be lost. Continue?')) return;
                    onSelect(file.path);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (dirty && !confirm('Unsaved changes will be lost. Continue?')) return;
                      onSelect(file.path);
                    }
                  }}
                >
                  {file.name}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}