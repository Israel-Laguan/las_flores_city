import { useState, useEffect, useCallback } from 'react';
import { fetchPromotionStatus as fetchPromoStatus, promoteStaging as promoStaging, promoteProduction as promoProduction, rollbackStaging as rollbackStg, type PromotionStatus } from '@/lib/promotion';

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
      const data = await fetchPromoStatus();
      setStatuses(data);
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

  const promoteStaging = useCallback(async (contentPath: string) => {
    setMutating(true);
    setError(null);
    try {
      await promoStaging(contentPath);
      await fetchStatuses(true);
    } catch {
      setError('Failed to promote to staging');
    } finally {
      setMutating(false);
    }
  }, [fetchStatuses]);

  const promoteProduction = useCallback(async (contentPath: string) => {
    setMutating(true);
    setError(null);
    try {
      await promoProduction(contentPath);
      await fetchStatuses(true);
    } catch {
      setError('Failed to promote to production');
    } finally {
      setMutating(false);
    }
  }, [fetchStatuses]);

  const rollbackStaging = useCallback(async (contentPath: string) => {
    setMutating(true);
    setError(null);
    try {
      await rollbackStg(contentPath);
      await fetchStatuses(true);
    } catch {
      setError('Failed to rollback staging');
    } finally {
      setMutating(false);
    }
  }, [fetchStatuses]);

  return { statuses, loading, mutating, error, promoteStaging, promoteProduction, rollbackStaging };
}
