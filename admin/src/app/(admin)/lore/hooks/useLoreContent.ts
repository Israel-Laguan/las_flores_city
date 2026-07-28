import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/client-api';
import { useTrackedFetch } from './useTrackedFetch';

interface LoreFileResponse {
  success: boolean;
  data: { path: string; content: string; size: number; modifiedAt: string };
}

export function useLoreContent(selectedPath: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const { withTracking } = useTrackedFetch();

  const fetchContent = useCallback(async () => {
    if (!selectedPath) {
      setContent(null);
      setContentLoading(false);
      setContentError(null);
      return;
    }
    setContentLoading(true);
    setContentError(null);
    await withTracking(
      () => adminFetch<LoreFileResponse>(
        `/admin/lore/file?path=${encodeURIComponent(selectedPath)}`,
      ),
      (data) => {
        if (data.success) setContent(data.data.content);
        else setContentError('Failed to load file content');
      },
      () => setContentError('Failed to load file content'),
      () => setContentLoading(false),
    );
  }, [selectedPath, withTracking]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  return { content, contentLoading, contentError, refetch: fetchContent };
}
