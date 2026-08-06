'use client';

import styles from '@/components/editor/editor.module.css';
import FileTree from '@/components/editor/FileTree';
import EditorPanel from '@/components/editor/EditorPanel';
import { useEditor } from '@/components/editor/useEditor';
import { useUnsafeNavigationGuard } from '@/hooks/useUnsafeNavigationGuard';

export default function EditorPage() {
  const editor = useEditor();
  useUnsafeNavigationGuard(editor.dirty);

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