'use client';

import { useState, useCallback } from 'react';
import { fetchPromotionStatus as fetchPromoStatus, promoteStaging as promoStaging, promoteProduction as promoProduction, rollbackStaging as rollbackStg, type PromotionStatus } from '@/lib/promotion';

export type { PromotionStatus } from '@/lib/promotion';

export function usePromotion() {
  const [promotionStatuses, setPromotionStatuses] = useState<PromotionStatus[]>([]);
  const [promotionLoading, setPromotionLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [promotionError, setPromotionError] = useState<string | null>(null);

  const fetchPromotionStatus = useCallback(async () => {
    setPromotionLoading(true);
    try {
      const data = await fetchPromoStatus();
      setPromotionStatuses(data);
      setPromotionError(null);
    } catch {
      setPromotionError('Failed to fetch promotion status');
    }
    finally { setPromotionLoading(false); }
  }, []);

  const runPromotionAction = useCallback(async (action: () => Promise<void>, errorMessage: string) => {
    setPublishing(true);
    setPublishError(null);
    try {
      await action();
      await fetchPromotionStatus();
    } catch {
      setPublishError(errorMessage);
    } finally {
      setPublishing(false);
    }
  }, [fetchPromotionStatus]);

  const runPublish = useCallback(async () => {
    setPublishing(true);
    setPublishError(null);
    const errors: string[] = [];
    try {
      for (const status of promotionStatuses) {
        if (!status.stages.dev) continue;
        if (!status.stages.staging) {
          try {
            await promoStaging(status.contentPath);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to promote ${status.contentPath} to staging: ${msg}`);
            continue;
          }
        }
        try {
          if (!status.stages.production) {
            await promoProduction(status.contentPath);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to promote ${status.contentPath} to production: ${msg}`);
        }
      }
      if (errors.length > 0) {
        setPublishError(
          `Publish completed with ${errors.length} error(s):\n${errors.join('\n')}`,
        );
      }
    } finally {
      await fetchPromotionStatus();
      setPublishing(false);
    }
  }, [promotionStatuses, fetchPromotionStatus]);

  const promoteStaging = useCallback(
    (contentPath: string) => runPromotionAction(() => promoStaging(contentPath), 'Failed to promote to staging'),
    [runPromotionAction],
  );

  const promoteProduction = useCallback(
    (contentPath: string) => runPromotionAction(() => promoProduction(contentPath), 'Failed to promote to production'),
    [runPromotionAction],
  );

  const rollbackStaging = useCallback(
    (contentPath: string) => runPromotionAction(() => rollbackStg(contentPath), 'Failed to rollback staging'),
    [runPromotionAction],
  );

  return {
    promotionStatuses,
    promotionLoading,
    promotionError,
    publishing,
    publishError,
    fetchPromotionStatus,
    runPublish,
    promoteStaging,
    promoteProduction,
    rollbackStaging,
  };
}