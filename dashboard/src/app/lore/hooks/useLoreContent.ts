import { useState, useEffect } from 'react';

interface LoreFileResponse {
  success: boolean;
  data: { path: string; content: string; size: number; modifiedAt: string };
}

export function useLoreContent(selectedPath: string | null) {
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (selectedPath) {
      setContentLoading(true);
      setContentError(null);
      fetch(`/api/admin/lore/file?path=${encodeURIComponent(selectedPath)}`)
        .then((res) => res.json())
        .then((data: LoreFileResponse) => {
          if (active) {
            if (data.success) {
              setContent(data.data.content);
            } else {
              setContentError('Failed to load file content');
            }
          }
        })
        .catch(() => {
          if (active) {
            setContentError('Failed to load file content');
          }
        })
        .finally(() => {
          if (active) {
            setContentLoading(false);
          }
        });
    } else {
      setContent(null);
    }
    return () => {
      active = false;
    };
  }, [selectedPath]);

  return { content, contentLoading, contentError };
}
