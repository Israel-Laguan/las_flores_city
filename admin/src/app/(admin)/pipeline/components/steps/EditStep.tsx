'use client';

import FileTree from '@/components/editor/FileTree';
import EditorPanel from '@/components/editor/EditorPanel';
import { useEditor } from '@/components/editor/useEditor';
import styles from '../../pipeline.module.css';

export default function EditStep() {
  const editor = useEditor();

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>1. Edit Content</h2>
      <p className={styles.stepDescription}>
        Create or edit YAML content files. When finished, proceed to validation.
      </p>
      <div className={styles.editorLayout}>
        <FileTree
          tree={editor.tree}
          treeLoading={editor.treeLoading}
          treeError={editor.treeError}
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
    </div>
  );
}
