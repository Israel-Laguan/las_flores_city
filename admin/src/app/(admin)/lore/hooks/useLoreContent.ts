import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/client-api';

interface LoreFileResponse {
  success: boolean;
  data: { path: string; content: string; size: number; modifiedAt: string };
}

export function useLoreContent(selectedPath: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    if (!selectedPath) {
      setContent(null);
      return;
    }
    setContentLoading(true);
    setContentError(null);
    try {
      const data = await adminFetch<LoreFileResponse>(
        `/admin/lore/file?path=${encodeURIComponent(selectedPath)}`,
      );
      if (data.success) setContent(data.data.content);
      else setContentError('Failed to load file content');
    } catch { setContentError('Failed to load file content'); }
    finally { setContentLoading(false); }
  }, [selectedPath]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  return { content, contentLoading, contentError, refetch: fetchContent };
}
