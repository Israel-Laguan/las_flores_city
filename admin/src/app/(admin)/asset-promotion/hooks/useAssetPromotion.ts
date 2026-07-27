import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/client-api';

interface PromotionStatus {
  contentPath: string;
  name: string;
  slug: string;
  stages: {
    dev?: { url: string };
    staging?: { url: string };
    production?: { url: string };
  };
}

interface PromotionStatusResponse {
  success: boolean;
  data: PromotionStatus[];
}

export function useAssetPromotion() {
  const [statuses, setStatuses] = useState<PromotionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatuses = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const json = await adminFetch<PromotionStatusResponse>('/admin/content/assets/promotion-status');
      if (json.success) {
        setStatuses(json.data);
      } else {
        setError('Failed to load promotion status');
      }
    } catch {
      setError('Failed to load promotion status');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const promoteStaging = async (contentPath: string) => {
    setMutating(true);
    setError(null);
    try {
      await adminFetch('/admin/content/assets/promote-staging', {
        method: 'POST',
        body: JSON.stringify({ contentPath }),
      });
      await fetchStatuses(true);
    } catch {
      setError('Failed to promote to staging');
    } finally {
      setMutating(false);
    }
  };

  const promoteProduction = async (contentPath: string) => {
    setMutating(true);
    setError(null);
    try {
      await adminFetch('/admin/content/assets/promote-production', {
        method: 'POST',
        body: JSON.stringify({ contentPath }),
      });
      await fetchStatuses(true);
    } catch {
      setError('Failed to promote to production');
    } finally {
      setMutating(false);
    }
  };

  const rollbackStaging = async (contentPath: string) => {
    setMutating(true);
    setError(null);
    try {
      await adminFetch('/admin/content/assets/rollback-staging', {
        method: 'POST',
        body: JSON.stringify({ contentPath }),
      });
      await fetchStatuses(true);
    } catch {
      setError('Failed to rollback staging');
    } finally {
      setMutating(false);
    }
  };

  return { statuses, loading, mutating, error, promoteStaging, promoteProduction, rollbackStaging };
}
