'use client';

import { useRef } from 'react';
import { cn } from '@las-flores/ui';
import styles from '../editor.module.css';

interface Props {
  selectedPath: string | null;
  fileContent: string;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  onContentChange: (v: string) => void;
  onSave: () => void;
}

export default function EditorPanel({ selectedPath, fileContent, dirty, saving, saveError, saveSuccess, onContentChange, onSave }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      onSave();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = fileContent.substring(0, start) + '  ' + fileContent.substring(end);
      onContentChange(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const lineCount = fileContent.split('\n').length;

  if (!selectedPath) {
    return (
      <div className={styles.emptyState}>
        <p>Select a file from the tree to edit</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.editorHeader}>
        <span className={styles.editorPath}>
          {selectedPath}
          {dirty && <span className={styles.dirtyDot} title="Unsaved changes" />}
        </span>
        <div className={styles.editorActions}>
          <span className={styles.statusText}>{dirty ? 'Modified' : 'Saved'}</span>
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className={cn(styles.saveButton, (!dirty || saving) && styles.disabledButton)}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {saveError && <div className={styles.errorBox}>{saveError}</div>}
      {saveSuccess && <div className={styles.successBox}>Saved successfully</div>}

      <textarea
        ref={textareaRef}
        value={fileContent}
        onChange={e => onContentChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={styles.textarea}
        spellCheck={false}
      />

      <div className={styles.statusBar}>
        <span>Lines: {lineCount} | Size: {new Blob([fileContent]).size} bytes</span>
        <span>Ctrl+S to save</span>
      </div>
    </>
  );
}