'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import styles from './LoreViewer.module.css';

interface LoreViewerProps {
  lorePath: string | null;
  onClose: () => void;
  readOnly?: boolean;
}

function LoreEditor({ content, onChange, onSave, onCancel, saving }: {
  content: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  return (
    <>
      <textarea
        className={styles.editorTextarea}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
      <div className={styles.editorActions}>
        <button className={cn(styles.button, styles.primaryButton)} onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button className={cn(styles.button, styles.secondaryButton)} onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

function LoreModal({ lorePath, readOnly, dirty, content, loading, error, exists, editing, saving, onClose, onSave, onStartEdit, onCancelEdit, onChange }: {
  lorePath: string;
  readOnly: boolean;
  dirty: boolean;
  content: string;
  loading: boolean;
  error: string | null;
  exists: boolean;
  editing: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>
              {readOnly ? 'Narrative' : 'Lore'}
              {dirty && <span className={styles.dirtyIndicator} title="Unsaved changes" />}
            </h3>
            <div className={styles.path}>{lorePath}</div>
          </div>
          <button className={styles.closeButton} onClick={onClose}>Close</button>
        </div>
        {error && <div className={styles.errorBox}>{error}</div>}
        {!exists && !loading && !error && (
          <div className={styles.notFound}>This file doesn&apos;t exist yet.</div>
        )}
        {editing ? (
          <>
            <LoreEditor
              content={content}
              onChange={onChange}
              onSave={onSave}
              onCancel={onCancelEdit}
              saving={saving}
            />
            <div className={styles.hint}>Press Ctrl+S to save</div>
          </>
        ) : (
          <>
            <div className={styles.content}>{loading ? 'Loading...' : content || 'No content'}</div>
            {!readOnly && (
              <div className={styles.viewActions}>
                <button className={cn(styles.button, styles.primaryButton)} onClick={onStartEdit}>
                  {exists ? 'Edit' : 'Create'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function useLoreViewer(lorePath: string | null, onClose: () => void) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    function handleCtrlS(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && editing && dirty && !saving) {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', handleCtrlS);
    return () => window.removeEventListener('keydown', handleCtrlS);
  }, [editing, dirty, saving, content, lorePath]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    if (!lorePath) return;
    setLoading(true); setError(null); setEditing(false); setDirty(false);
    adminFetch<{ success: boolean; data?: { content: string; exists?: boolean }; error?: string }>(
      `/admin/lore/file?path=${encodeURIComponent(lorePath)}`,
    )
      .then((data) => {
        if (data.success && data.data) { setContent(data.data.content); setExists(data.data.exists ?? true); }
        else { setError(data.error || 'Failed to load lore'); }
      })
      .catch(() => setError('Failed to load lore'))
      .finally(() => setLoading(false));
  }, [lorePath]);

  function handleSave() {
    if (!lorePath) return;
    setSaving(true);
    adminFetch<{ success: boolean; error?: string }>(
      '/admin/lore/file',
      { method: 'POST', body: JSON.stringify({ path: lorePath, content }) },
    )
      .then((data) => { if (data.success) { setEditing(false); setDirty(false); setExists(true); } else { setError(data.error || 'Failed to save'); } })
      .catch(() => setError('Failed to save'))
      .finally(() => setSaving(false));
  }

  function handleClose() {
    if (dirty && !confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  }

  return {
    content, loading, saving, error, exists, editing, setEditing,
    dirty, setDirty, handleClose, handleSave,
    handleChange: (v: string) => { setContent(v); setDirty(true); },
  };
}

export default function LoreViewer({ lorePath, onClose, readOnly = false }: LoreViewerProps) {
  const {
    content, loading, saving, error, exists, editing, setEditing,
    dirty, setDirty, handleClose, handleSave, handleChange,
  } = useLoreViewer(lorePath, onClose);

  if (!lorePath) return null;

  return (
    <LoreModal
      lorePath={lorePath}
      readOnly={readOnly}
      dirty={dirty}
      content={content}
      loading={loading}
      error={error}
      exists={exists}
      editing={editing}
      saving={saving}
      onClose={handleClose}
      onSave={handleSave}
      onStartEdit={() => setEditing(true)}
      onCancelEdit={() => {
        if (dirty && !confirm('Discard unsaved changes?')) return;
        setEditing(false);
        setDirty(false);
      }}
      onChange={handleChange}
    />
  );
}
