import type { ContentPlan } from '@las-flores/shared';
import * as api from './useStoryBuilderApi';

type SetState<T> = (v: T | ((prev: T) => T)) => void;

interface DraftApiOptions {
  setLoading: SetState<boolean>;
  setError: SetState<string | null>;
  setPlan: SetState<ContentPlan | null>;
}

async function withLoading<T>(
  setLoading: SetState<boolean>,
  setError: SetState<string | null>,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  setLoading(true);
  setError(null);
  try {
    return await fn();
  } catch (err: any) {
    setError(err?.message || String(err));
  } finally {
    setLoading(false);
  }
}

export async function refreshPlanFromDb(
  planId: string,
  setPlan: SetState<ContentPlan | null>,
) {
  const refreshed = await api.loadPlanFromDb(planId).catch(() => null);
  if (refreshed?.success && refreshed.data?.plan_json) {
    setPlan(refreshed.data.plan_json);
  }
}

export function createDraftPlanHandlers({ setLoading, setError, setPlan }: DraftApiOptions) {
  async function handleGenerateDrafts(planId: string, count?: number) {
    const data = await withLoading(setLoading, setError, () => api.generateDrafts(planId, count));
    if (data?.success) {
      await refreshPlanFromDb(planId, setPlan);
    } else if (data) {
      setError(data.error || 'Failed to generate drafts');
    }
  }

  async function handleChooseDraft(planId: string, itemId: string, promptType: string, filename: string) {
    const data = await withLoading(setLoading, setError, () => api.chooseDraft(planId, itemId, promptType, filename));
    if (data?.success) {
      await refreshPlanFromDb(planId, setPlan);
    } else if (data) {
      setError(data.error || 'Failed to choose draft');
    }
  }

  return { handleGenerateDrafts, handleChooseDraft };
}
