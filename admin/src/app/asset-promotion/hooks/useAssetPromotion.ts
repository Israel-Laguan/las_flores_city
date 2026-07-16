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
  const [error, setError] = useState<string | null>(null);

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const promoteStaging = async (contentPath: string) => {
    await adminFetch('/admin/content/assets/promote-staging', {
      method: 'POST',
      body: JSON.stringify({ contentPath }),
    });
    await fetchStatuses();
  };

  const promoteProduction = async (contentPath: string) => {
    await adminFetch('/admin/content/assets/promote-production', {
      method: 'POST',
      body: JSON.stringify({ contentPath }),
    });
    await fetchStatuses();
  };

  const rollbackStaging = async (contentPath: string) => {
    await adminFetch('/admin/content/assets/rollback-staging', {
      method: 'POST',
      body: JSON.stringify({ contentPath }),
    });
    await fetchStatuses();
  };

  return { statuses, loading, error, promoteStaging, promoteProduction, rollbackStaging };
}