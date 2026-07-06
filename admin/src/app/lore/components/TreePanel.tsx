import { adminStyles as styles } from '@/lib/adminStyles';

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
        <div key={type} style={{ marginBottom: '0.5rem' }}>
          <button
            onClick={() => onToggleType(type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'none',
              border: 'none',
              color: '#00ff00',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              padding: '0.25rem 0',
              width: '100%',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: '0.7rem' }}>{expanded.has(type) ? '▼' : '▶'}</span>
            <span style={{ textTransform: 'capitalize' }}>{type}</span>
            <span style={{
              ...styles.badge,
              backgroundColor: '#333',
              color: '#aaa',
              fontSize: '0.7rem',
              marginLeft: 'auto',
            }}>{typeFiles.length}</span>
          </button>
          {expanded.has(type) && (
            <div style={{ paddingLeft: '1rem' }}>
              {typeFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onSelectFile(file.path)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: selectedPath === file.path ? '#00ff0022' : 'none',
                    border: 'none',
                    color: selectedPath === file.path ? '#00ff00' : '#aaa',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '3px',
                    borderLeft: selectedPath === file.path ? '2px solid #00ff00' : '2px solid transparent',
                  }}
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
    <div style={{
      width: '280px',
      flexShrink: 0,
      border: '1px solid #333',
      borderRadius: '5px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {treeLoading && <p style={styles.muted}>Loading...</p>}
        {!treeLoading && Object.keys(filteredGroups).length === 0 && (
          <p style={styles.muted}>No files found.</p>
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