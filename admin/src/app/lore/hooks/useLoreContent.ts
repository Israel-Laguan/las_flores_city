import { useState, useEffect, useCallback } from 'react';

interface LoreFileResponse {
  success: boolean;
  data: { path: string; content: string; size: number; modifiedAt: string };
}

export function useLoreContent(selectedPath: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const fetchContent = useCallback(async (path: string) => {
    setContentLoading(true);
    setContentError(null);
    try {
      const res = await fetch(`/api/admin/lore/file?path=${encodeURIComponent(path)}`);
      const data: LoreFileResponse = await res.json();
      if (data.success) {
        setContent(data.data.content);
      } else {
        setContentError('Failed to load file content');
      }
    } catch {
      setContentError('Failed to load file content');
    } finally {
      setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPath) {
      fetchContent(selectedPath);
    } else {
      setContent(null);
    }
  }, [selectedPath, fetchContent]);

  return { content, contentLoading, contentError };
}