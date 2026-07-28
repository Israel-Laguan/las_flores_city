import { useState, useEffect, useCallback, useRef } from 'react';
import { adminFetch } from '@/lib/client-api';

interface LoreFileResponse {
  success: boolean;
  data: { path: string; content: string; size: number; modifiedAt: string };
}

export function useLoreContent(selectedPath: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchContent = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!selectedPath) {
      setContent(null);
      setContentLoading(false);
      setContentError(null);
      return;
    }
    setContentLoading(true);
    setContentError(null);
    try {
      const data = await adminFetch<LoreFileResponse>(
        `/admin/lore/file?path=${encodeURIComponent(selectedPath)}`,
      );
      if (requestId !== requestIdRef.current) return;
      if (data.success) setContent(data.data.content);
      else setContentError('Failed to load file content');
    } catch {
      if (requestId === requestIdRef.current) setContentError('Failed to load file content');
    } finally {
      if (requestId === requestIdRef.current) setContentLoading(false);
    }
  }, [selectedPath]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  return { content, contentLoading, contentError, refetch: fetchContent };
}
