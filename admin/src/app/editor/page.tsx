"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

interface FileEntry {
  path: string;
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
}

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

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  container: { display: 'flex', gap: '1rem', minHeight: 'calc(100vh - 10rem)' },
  treePanel: {
    width: '280px', flexShrink: 0, border: '1px solid #333', borderRadius: '5px',
    overflow: 'hidden', display: 'flex', flexDirection: 'column' as const,
  },
  treeHeader: { padding: '0.75rem', borderBottom: '1px solid #333', backgroundColor: '#0d0d1a' },
  treeInput: {
    width: '100%', padding: '0.5rem', backgroundColor: '#1a1a2e', color: '#00ff00',
    border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.85rem', boxSizing: 'border-box' as const,
  },
  treeScroll: { flex: 1, overflowY: 'auto' as const, padding: '0.5rem 0' },
  typeGroup: { marginBottom: '0.5rem' },
  typeHeader: {
    padding: '0.4rem 0.75rem', color: '#888', fontSize: '0.8rem', fontWeight: 'bold' as const,
    cursor: 'pointer', display: 'flex', justifyContent: 'space-between' as const, alignItems: 'center' as const,
  },
  fileItem: {
    padding: '0.35rem 0.75rem 0.35rem 1.5rem', cursor: 'pointer', fontSize: '0.85rem',
    display: 'flex', alignItems: 'center' as const, gap: '0.5rem',
  },
  fileItemActive: {
    padding: '0.35rem 0.75rem 0.35rem 1.5rem', cursor: 'pointer', fontSize: '0.85rem',
    display: 'flex', alignItems: 'center' as const, gap: '0.5rem',
    backgroundColor: '#00ff0022', borderLeft: '2px solid #00ff00',
  },
  editorPanel: { flex: 1, display: 'flex', flexDirection: 'column' as const, border: '1px solid #333', borderRadius: '5px', overflow: 'hidden' },
  editorHeader: {
    padding: '0.75rem 1rem', borderBottom: '1px solid #333', backgroundColor: '#0d0d1a',
    display: 'flex', justifyContent: 'space-between' as const, alignItems: 'center' as const,
  },
  editorPath: { color: '#888', fontSize: '0.85rem' },
  editorActions: { display: 'flex', gap: '0.5rem', alignItems: 'center' as const },
  button: {
    padding: '0.5rem 1rem', borderRadius: '5px', fontWeight: 'bold' as const, fontFamily: 'monospace',
    cursor: 'pointer', border: 'none', fontSize: '0.85rem',
  },
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
  secondaryButton: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' as const },
  textarea: {
    flex: 1, width: '100%', backgroundColor: '#0d0d1a', color: '#00ff00',
    border: 'none', padding: '1rem', fontFamily: 'monospace', fontSize: '0.9rem',
    resize: 'none' as const, outline: 'none', lineHeight: '1.6', tabSize: 2,
  },
  statusBar: {
    padding: '0.5rem 1rem', borderTop: '1px solid #333', backgroundColor: '#0d0d1a',
    display: 'flex', justifyContent: 'space-between' as const, fontSize: '0.8rem', color: '#888',
  },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '0.75rem', borderRadius: '5px', margin: '0.5rem 1rem' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '0.75rem', borderRadius: '5px', margin: '0.5rem 1rem' },
  muted: { color: '#888' },
  emptyState: { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#555', fontSize: '1rem' },
  dirtyDot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ffaa00', marginLeft: '0.5rem' },
};

// eslint-disable-next-line max-lines-per-function
export default function EditorPage() {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load file tree
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/content/tree');
        const data = await res.json();
        if (active && data.success) {
          setTree(data.data.tree);
          // Auto-expand all types initially
          const types = new Set<string>(data.data.tree.map((f: FileEntry) => f.type));
          setExpandedTypes(types);
        }
      } catch { /* ignore */ } finally {
        if (active) setTreeLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Load file content when selectedPath changes
  useEffect(() => {
    if (!selectedPath) {
      setFileContent('');
      setOriginalContent('');
      setDirty(false);
      setSaveError(null);
      setSaveSuccess(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/content/file?path=${encodeURIComponent(selectedPath)}`);
        const data = await res.json();
        if (active && data.success) {
          setFileContent(data.data.content);
          setOriginalContent(data.data.content);
          setDirty(false);
          setSaveError(null);
          setSaveSuccess(false);
        } else if (active) {
          setSaveError(data.error || 'Failed to load file');
        }
      } catch {
        if (active) setSaveError('Failed to load file');
      }
    })();
    return () => { active = false; };
  }, [selectedPath]);

  // Warn on beforeunload when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleSave = useCallback(async () => {
    if (!selectedPath || !dirty) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/admin/content/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath, content: fileContent }),
      });
      const data = await res.json();
      if (data.success) {
        setOriginalContent(fileContent);
        setDirty(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(data.error || 'Save failed');
      }
    } catch {
      setSaveError('Save request failed');
    } finally {
      setSaving(false);
    }
  }, [selectedPath, dirty, fileContent]);

  const handleContentChange = (value: string) => {
    setFileContent(value);
    setDirty(value !== originalContent);
    setSaveSuccess(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+S / Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
    // Tab to insert spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const value = fileContent;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      setFileContent(newValue);
      setDirty(newValue !== originalContent);
      // Restore cursor position
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Group and filter files
  const filtered = filter
    ? tree.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()) || f.path.toLowerCase().includes(filter.toLowerCase()))
    : tree;

  const grouped: Record<string, FileEntry[]> = {};
  for (const file of filtered) {
    if (!grouped[file.type]) grouped[file.type] = [];
    grouped[file.type].push(file);
  }

  const lineCount = fileContent.split('\n').length;

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>📝 Content Editor</h1>
      <div style={styles.container}>
        {/* Left panel — file tree */}
        <div style={styles.treePanel}>
          <div style={styles.treeHeader}>
            <input
              type="text"
              placeholder="Search files..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={styles.treeInput}
            />
          </div>
          <div style={styles.treeScroll}>
            {treeLoading ? (
              <p style={{ ...styles.muted, padding: '1rem', fontSize: '0.85rem' }}>Loading...</p>
            ) : Object.keys(grouped).length === 0 ? (
              <p style={{ ...styles.muted, padding: '1rem', fontSize: '0.85rem' }}>No files found</p>
            ) : (
              Object.entries(grouped).map(([type, files]) => (
                <div key={type} style={styles.typeGroup}>
                  <div style={styles.typeHeader} onClick={() => toggleType(type)}>
                    <span>{TYPE_ICONS[type] || '📄'} {type} ({files.length})</span>
                    <span style={{ color: '#555' }}>{expandedTypes.has(type) ? '▲' : '▼'}</span>
                  </div>
                  {expandedTypes.has(type) && files.map(file => (
                    <div
                      key={file.path}
                      style={selectedPath === file.path ? styles.fileItemActive : styles.fileItem}
                      onClick={() => {
                        if (dirty && !confirm('Unsaved changes will be lost. Continue?')) return;
                        setSelectedPath(file.path);
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

        {/* Right panel — editor */}
        <div style={styles.editorPanel}>
          {selectedPath ? (
            <>
              <div style={styles.editorHeader}>
                <span style={styles.editorPath}>
                  {selectedPath}
                  {dirty && <span style={styles.dirtyDot} title="Unsaved changes" />}
                </span>
                <div style={styles.editorActions}>
                  <span style={{ fontSize: '0.8rem', color: '#888' }}>
                    {dirty ? 'Modified' : 'Saved'}
                  </span>
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    style={{
                      ...styles.button,
                      ...((!dirty || saving) ? styles.disabledButton : styles.primaryButton),
                    }}
                  >
                    {saving ? '⏳ Saving...' : '💾 Save'}
                  </button>
                </div>
              </div>

              {saveError && <div style={styles.errorBox}>{saveError}</div>}
              {saveSuccess && <div style={styles.successBox}>✅ Saved successfully</div>}

              <textarea
                ref={textareaRef}
                value={fileContent}
                onChange={e => handleContentChange(e.target.value)}
                onKeyDown={handleKeyDown}
                style={styles.textarea}
                spellCheck={false}
              />

              <div style={styles.statusBar}>
                <span>Lines: {lineCount} | Size: {new Blob([fileContent]).size} bytes</span>
                <span>Ctrl+S to save</span>
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              <p>Select a file from the tree to edit</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
