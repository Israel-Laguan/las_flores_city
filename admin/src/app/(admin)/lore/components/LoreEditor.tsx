'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { adminFetch } from '@/lib/client-api';
import MarkdownViewer from './MarkdownViewer';
import styles from './LoreEditor.module.css';

interface LoreEditorProps {
  selectedPath: string | null;
  content: string | null;
  contentLoading: boolean;
  contentError: string | null;
  onSaved?: () => void;
}

export default function LoreEditor({ selectedPath, content, contentLoading, contentError, onSaved }: LoreEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setEditing(false);
    setDraft('');
    setDirty(false);
    setSaving(false);
    setSaveError(null);
    setSaveSuccess(false);
  }, [selectedPath]);

  const savePathRef = useRef<string | null>(null);
  const saveContentRef = useRef<string>('');

  const enterEdit = useCallback(() => {
    setDraft(content ?? '');
    setDirty(false);
    setSaveError(null);
    setSaveSuccess(false);
    setEditing(true);
  }, [content]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDirty(false);
    setSaveError(null);
  }, []);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    setDirty(value !== content);
    setSaveSuccess(false);
  }, [content]);

  const handleSave = useCallback(async () => {
    if (!selectedPath) return;
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    savePathRef.current = selectedPath;
    saveContentRef.current = draft;
    try {
      const data = await adminFetch<{ success: boolean; error?: string }>(
        '/admin/lore/file',
        { method: 'POST', body: JSON.stringify({ path: selectedPath, content: draft }) },
      );
      if (data.success) {
        if (savePathRef.current !== selectedPath || saveContentRef.current !== draft) return;
        setSaveSuccess(true);
        setDirty(false);
        setEditing(false);
        onSaved?.();
      } else {
        if (savePathRef.current !== selectedPath || saveContentRef.current !== draft) return;
        setSaveError(data.error || 'Save failed');
      }
    } catch {
      if (savePathRef.current !== selectedPath || saveContentRef.current !== draft) return;
      setSaveError('Save failed');
    } finally {
      setSaving(false);
    }
  }, [selectedPath, draft, saving, onSaved]);

  if (!selectedPath) {
    return <MarkdownViewer selectedPath={null} content={null} contentLoading={false} contentError={null} />;
  }

  if (contentLoading) {
    return <MarkdownViewer selectedPath={selectedPath} content={null} contentLoading={true} contentError={null} />;
  }

  if (contentError) {
    return <MarkdownViewer selectedPath={selectedPath} content={null} contentLoading={false} contentError={contentError} />;
  }

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.pathLabel}>{selectedPath}</span>
        <div className={styles.toolbarActions}>
          {!editing && (
            <button onClick={enterEdit} className={styles.editButton}>
              Edit
            </button>
          )}
          {editing && (
            <>
              <span className={dirty ? styles.dirtyIndicator : styles.cleanIndicator}>
                {dirty ? '● Unsaved' : '✓ Saved'}
              </span>
              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className={styles.saveButton}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={cancelEdit} disabled={saving} className={styles.cancelButton}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {saveError && <div className={styles.errorBox}>{saveError}</div>}
      {saveSuccess && <div className={styles.successBox}>Saved successfully.</div>}

      {editing ? (
        <textarea
          className={styles.textarea}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          spellCheck
        />
      ) : (
        <div className={styles.viewerWrapper}>
          <MarkdownViewer
            selectedPath={selectedPath}
            content={content}
            contentLoading={false}
            contentError={null}
          />
        </div>
      )}
    </div>
  );
}
