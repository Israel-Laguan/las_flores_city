'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/client-api';

interface FileEntry {
  path: string;
  name: string;
  type: string;
  size: number;
  modifiedAt: string;
}

export function useEditor() {
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await adminFetch<{ success: boolean; data?: { tree: FileEntry[] } }>('/admin/content/tree');
        if (active && data.success && data.data) {
          setTree(data.data.tree);
          setExpandedTypes(new Set(data.data.tree.map(f => f.type)));
        }
      } catch { /* ignore */ } finally { if (active) setTreeLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedPath) {
      setFileContent(''); setOriginalContent(''); setDirty(false); setSaveError(null); setSaveSuccess(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const data = await adminFetch<{ success: boolean; data?: { content: string }; error?: string }>(
          `/admin/content/file?path=${encodeURIComponent(selectedPath)}`,
        );
        if (active && data.success && data.data) {
          setFileContent(data.data.content);
          setOriginalContent(data.data.content);
          setDirty(false); setSaveError(null); setSaveSuccess(false);
        } else if (active) { setSaveError(data.error || 'Failed to load file'); }
      } catch { if (active) setSaveError('Failed to load file'); }
    })();
    return () => { active = false; };
  }, [selectedPath]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleSave = useCallback(async () => {
    if (!selectedPath || !dirty) return;
    setSaving(true); setSaveError(null); setSaveSuccess(false);
    try {
      const data = await adminFetch<{ success: boolean; data?: { content: string }; error?: string }>(
        '/admin/content/file', { method: 'PUT', body: JSON.stringify({ path: selectedPath, content: fileContent }) },
      );
      if (data.success) { setOriginalContent(fileContent); setDirty(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }
      else { setSaveError(data.error || 'Save failed'); }
    } catch { setSaveError('Save request failed'); } finally { setSaving(false); }
  }, [selectedPath, dirty, fileContent]);

  const handleContentChange = (value: string) => {
    setFileContent(value); setDirty(value !== originalContent); setSaveSuccess(false);
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => { const next = new Set(prev); if (next.has(type)) next.delete(type); else next.add(type); return next; });
  };

  return {
    tree, treeLoading, selectedPath, fileContent, dirty, saving, saveError, saveSuccess, filter, expandedTypes,
    setFilter, setSelectedPath, toggleType, handleSave, handleContentChange,
  };
}