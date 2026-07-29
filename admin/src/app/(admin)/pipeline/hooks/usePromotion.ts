'use client';

import { useState, useCallback } from 'react';
import { fetchPromotionStatus as fetchPromoStatus, promoteStaging as promoStaging, promoteProduction as promoProduction, rollbackStaging as rollbackStg, type PromotionStatus } from '@/lib/promotion';

export type { PromotionStatus } from '@/lib/promotion';

export function usePromotion() {
  const [promotionStatuses, setPromotionStatuses] = useState<PromotionStatus[]>([]);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const fetchPromotionStatus = useCallback(async () => {
    setPromotionLoading(true);
    try {
      const data = await fetchPromoStatus();
      setPromotionStatuses(data);
    } catch { /* soft */ }
    finally { setPromotionLoading(false); }
  }, []);

  const runPublish = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      for (const status of promotionStatuses) {
        if (!status.stages.dev) continue;
        if (!status.stages.staging) {
          await promoStaging(status.contentPath);
        }
        if (!status.stages.production) {
          await promoProduction(status.contentPath);
        }
      }
    } catch {
      setPublishError('Publish failed');
    } finally {
      await fetchPromotionStatus();
      setPublishing(false);
    }
  }, [promotionStatuses, fetchPromotionStatus]);

  const promoteStaging = useCallback(async (contentPath: string) => {
    setPublishing(true);
    setPublishError(null);
    try {
      await promoStaging(contentPath);
      await fetchPromotionStatus();
    } catch {
      setPublishError('Failed to promote to staging');
    } finally {
      setPublishing(false);
    }
  }, [fetchPromotionStatus]);

  const promoteProduction = useCallback(async (contentPath: string) => {
    setPublishing(true);
    setPublishError(null);
    try {
      await promoProduction(contentPath);
      await fetchPromotionStatus();
    } catch {
      setPublishError('Failed to promote to production');
    } finally {
      setPublishing(false);
    }
  }, [fetchPromotionStatus]);

  const rollbackStaging = useCallback(async (contentPath: string) => {
    setPublishing(true);
    setPublishError(null);
    try {
      await rollbackStg(contentPath);
      await fetchPromotionStatus();
    } catch {
      setPublishError('Failed to rollback staging');
    } finally {
      setPublishing(false);
    }
  }, [fetchPromotionStatus]);

  return {
    promotionStatuses,
    promotionLoading,
    publishing,
    publishError,
    fetchPromotionStatus,
    runPublish,
    promoteStaging,
    promoteProduction,
    rollbackStaging,
  };
}