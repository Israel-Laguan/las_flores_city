'use client';

import styles from './editor.module.css';
import FileTree from './components/FileTree';
import EditorPanel from './components/EditorPanel';
import { useEditor } from './hooks/useEditor';

export default function EditorPage() {
  const editor = useEditor();

  return (
    <main className={styles.main}>
      <h1>Content Editor</h1>
      <div className={styles.container}>
        <FileTree
          tree={editor.tree}
          treeLoading={editor.treeLoading}
          filter={editor.filter}
          selectedPath={editor.selectedPath}
          expandedTypes={editor.expandedTypes}
          dirty={editor.dirty}
          onFilterChange={editor.setFilter}
          onSelect={editor.setSelectedPath}
          onToggleType={editor.toggleType}
        />
        <div className={styles.editorPanel}>
          <EditorPanel
            selectedPath={editor.selectedPath}
            fileContent={editor.fileContent}
            dirty={editor.dirty}
            saving={editor.saving}
            saveError={editor.saveError}
            saveSuccess={editor.saveSuccess}
            onContentChange={editor.handleContentChange}
            onSave={editor.handleSave}
          />
        </div>
      </div>
    </main>
  );
}