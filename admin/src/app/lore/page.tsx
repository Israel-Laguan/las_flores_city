"use client";

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { adminStyles as styles } from '@/lib/adminStyles';
import { useLoreTree } from './hooks/useLoreTree';
import { useLoreContent } from './hooks/useLoreContent';
import SearchBar from './components/SearchBar';
import TreePanel from './components/TreePanel';
import MarkdownViewer from './components/MarkdownViewer';

export default function LoreBrowserPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedPath = searchParams.get('path') || null;

  const { tree, treeLoading, expandedTypes, toggleType, groupByType } = useLoreTree();
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
    <main style={styles.main}>
      <h1 style={styles.heading}>Lore Browser</h1>
      <div style={{ display: 'flex', gap: '1rem', minHeight: 'calc(100vh - 10rem)' }}>
        {/* Left panel — file tree */}
        <div style={{
          width: '280px',
          flexShrink: 0,
          border: '1px solid #333',
          borderRadius: '5px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <SearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
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