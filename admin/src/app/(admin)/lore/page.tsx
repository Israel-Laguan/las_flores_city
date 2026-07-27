'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLoreTree } from './hooks/useLoreTree';
import { useLoreContent } from './hooks/useLoreContent';
import SearchBar from './components/SearchBar';
import TreePanel from './components/TreePanel';
import MarkdownViewer from './components/MarkdownViewer';
import styles from './lore.module.css';

export default function LoreBrowserPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedPath = searchParams.get('path') || null;

  const { tree, treeLoading, treeError, expandedTypes, toggleType, groupByType } = useLoreTree();
  const { content, contentLoading, contentError } = useLoreContent(selectedPath);
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <main className={styles.main}>
      <h1>Lore Browser</h1>
      <div className={styles.container}>
        {/* Left panel — file tree */}
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
        </div>

        {/* Right panel — markdown viewer */}
        <MarkdownViewer
          selectedPath={selectedPath}
          content={content}
          contentLoading={contentLoading}
          contentError={contentError}
        />
      </div>
    </main>
  );
}
