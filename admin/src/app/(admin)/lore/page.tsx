'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import { useLoreTree } from './hooks/useLoreTree';
import { useLoreContent } from './hooks/useLoreContent';
import SearchBar from './components/SearchBar';
import TreePanel from './components/TreePanel';
import LoreEditor from './components/LoreEditor';
import styles from './lore.module.css';

export default function LoreBrowserPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedPath = searchParams.get('path') || null;

  const { tree, treeLoading, treeError, expandedTypes, toggleType, groupByType, refetch: refetchTree } = useLoreTree();
  const { content, contentLoading, contentError, refetch } = useLoreContent(selectedPath);
  const [searchQuery, setSearchQuery] = useState('');
  const [newFilePath, setNewFilePath] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const grouped = groupByType(tree);
  const filteredGroups = searchQuery
    ? Object.fromEntries(
        Object.entries(grouped).map(([type, files]) => [
          type,
          files.filter(
            (f) =>
              f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              f.path.toLowerCase().includes(searchQuery.toLowerCase())
          ),
        ]).filter(([, files]) => files.length > 0)
      )
    : grouped;

  const selectFile = (path: string) => {
    router.push(`/lore?path=${encodeURIComponent(path)}`);
  };

  const handleNewFile = useCallback(async () => {
    if (creating) return;
    const path = newFilePath.trim();
    if (!path) { setNewFileError('Path is required'); return; }
    setCreating(true);
    setNewFileError(null);
    try {
      const data = await adminFetch<{ success: boolean; error?: string }>(
        '/admin/lore/file',
        { method: 'POST', body: JSON.stringify({ path, content: `# ${path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'New Note'}\n\n` }) },
      );
      if (data.success) {
        setShowNewForm(false);
        setNewFilePath('');
        await refetchTree();
        router.push(`/lore?path=${encodeURIComponent(path)}`);
      } else {
        setNewFileError(data.error || 'Failed to create file');
      }
    } catch { setNewFileError('Network error'); }
    finally { setCreating(false); }
  }, [creating, newFilePath, router, refetchTree]);

  return (
    <main className={styles.main}>
      <h1>Story Bible</h1>
      <div className={styles.container}>
        <div className={styles.treePanel}>
          <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          {treeError && <div className={styles.errorBox}>{treeError}</div>}
          <TreePanel
            treeLoading={treeLoading}
            filteredGroups={filteredGroups}
            expandedTypes={expandedTypes}
            selectedPath={selectedPath}
            onToggleType={toggleType}
            onSelectFile={selectFile}
          />
          <div className={styles.newFileSection}>
            {showNewForm ? (
              <div className={styles.newFileForm}>
                <input
                  type="text"
                  placeholder="guides/my-note.md"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  className={styles.newFileInput}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNewFile(); }}
                />
                <div className={styles.newFileActions}>
                  <button onClick={handleNewFile} disabled={creating}
                    className={cn(styles.newFileButton, styles.newFileSaveButton)}>
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button onClick={() => { setShowNewForm(false); setNewFileError(null); }}
                    className={cn(styles.newFileButton, styles.newFileCancelButton)}>
                    Cancel
                  </button>
                </div>
                {newFileError && <div className={styles.newFileError}>{newFileError}</div>}
              </div>
            ) : (
              <button onClick={() => setShowNewForm(true)} className={styles.addFileButton}>
                + New Note
              </button>
            )}
          </div>
        </div>
        <LoreEditor
          selectedPath={selectedPath}
          content={content}
          contentLoading={contentLoading}
          contentError={contentError}
          onSaved={refetch}
        />
      </div>
    </main>
  );
}
