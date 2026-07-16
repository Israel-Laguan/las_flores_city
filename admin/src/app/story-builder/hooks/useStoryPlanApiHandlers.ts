import { useCallback } from 'react';
import type { ContentPlan } from '@las-flores/shared';
import type { Step } from '../types';
import * as api from './useStoryBuilderApi';
import { createDraftPlanHandlers, refreshPlanFromDb } from './useDraftPlanApi';

type SetState<T> = (v: T | ((prev: T) => T)) => void;

export interface Callbacks {
  setLoading: SetState<boolean>;
  setError: SetState<string | null>;
  setPlan: SetState<ContentPlan | null>;
  setStep: SetState<Step>;
  setPlanId: SetState<string | null>;
  setRefineFeedback: SetState<string>;
  setShowRefine: SetState<boolean>;
  setPreviewData: SetState<any>;
  setStagingResult: SetState<any>;
  setMigrationResult: SetState<any>;
  description: string;
  plan: ContentPlan | null;
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

export function createStoryPlanHandlers(cb: Callbacks) {
  const {
    setLoading, setError, setPlan, setStep, setPlanId, description, plan,
    setRefineFeedback, setShowRefine, setPreviewData, setStagingResult,
    setMigrationResult,
  } = cb;

  const handleGeneratePlan = useCallback(async () => {
    const data = await withLoading(setLoading, setError, () => api.generatePlan(description));
    if (!data) return;
    if (data.success && data.data) {
      setPlan(data.data.plan);
      setStep(2);
      api.savePlan(description, data.data.plan)
        .then(r => { if (r.success && r.data) setPlanId(r.data.planId); })
        .catch(e => console.error('Auto-save failed:', e));
    } else {
      setError(data.error || 'Failed to generate plan');
    }
  }, [description, setLoading, setError, setPlan, setStep, setPlanId]);

  const handleRefine = useCallback(async (planId: string, refineFeedback: string) => {
    const data = await withLoading(setLoading, setError, () => api.refinePlan(planId, refineFeedback));
    if (!data) return;
    if (data.success && data.data) {
      setPlan(data.data.plan);
      setRefineFeedback('');
      setShowRefine(false);
    } else {
      setError(data.error || 'Failed to refine plan');
    }
  }, [setLoading, setError, setPlan, setRefineFeedback, setShowRefine]);

  const handlePreview = useCallback(async (planId: string) => {
    const data = await withLoading(setLoading, setError, () => api.previewPlan(planId));
    if (!data) return;
    if (data.success && data.data) setPreviewData(data.data);
    else setError(data.error || 'Failed to preview plan');
  }, [setLoading, setError, setPreviewData]);

  const handleStage = useCallback(async (planId: string) => {
    const data = await withLoading(setLoading, setError, () => api.stagePlan(planId));
    if (!data) return;
    if (data.success) { setStagingResult(data.data); setStep(4); }
    else { setStagingResult(data.data); setError(data.data?.error || 'Staging failed'); }
  }, [setLoading, setError, setStep, setStagingResult]);

  const handleApprove = useCallback(async (planId: string) => {
    if (!plan) { setError('No plan to approve'); return; }
    const data = await withLoading(setLoading, setError, () => api.approvePlan(planId, plan));
    if (!data) return;
    if (data.success) setStep(3);
    else setError(data.error || 'Approval failed');
  }, [setLoading, setError, setStep, plan]);

  const handleMigrate = useCallback(async (planId: string) => {
    const data = await withLoading(setLoading, setError, () => api.migratePlan(planId));
    if (!data) return;
    if (data.success) { setMigrationResult(data.data); setStep(5); }
    else { setMigrationResult(data.data); setError(data.data?.error || 'Migration failed'); }
  }, [setLoading, setError, setStep, setMigrationResult]);

  const handleRetry = useCallback(async (planId: string) => {
    const data = await withLoading(setLoading, setError, () => api.retryPlan(planId));
    if (!data) return;
    if (data.success) { setStagingResult(data.data); if (data.data?.success) setStep(4); }
    else setError(data.error || 'Retry failed');
  }, [setLoading, setError, setStep, setStagingResult]);

  const handleSelectTemplate = useCallback(async (templateId: string) => {
    const data = await withLoading(setLoading, setError, () =>
      api.selectTemplate(templateId, description || templateId));
    if (!data) return;
    if (data.success && data.data) {
      setPlan(data.data.plan);
      setStep(2);
      api.savePlan(description || templateId, data.data.plan)
        .then(r => { if (r.success && r.data) setPlanId(r.data.planId); })
        .catch(e => console.error('Auto-save failed:', e));
    } else {
      setError(data.error || 'Failed to build template plan');
    }
  }, [description, setLoading, setError, setPlan, setStep, setPlanId]);

  const handleRegenerateLore = useCallback(async (planId: string, itemId: string) => {
    const data = await withLoading(setLoading, setError, () => api.regenerateLore(planId, itemId));
    if (!data) return;
    await refreshPlanFromDb(planId, setPlan);
  }, [setLoading, setError, setPlan]);

  const { handleGenerateDrafts, handleChooseDraft } = createDraftPlanHandlers({ setLoading, setError, setPlan });

  return {
    handleGeneratePlan, handleRefine, handlePreview, handleStage,
    handleApprove, handleMigrate, handleRetry, handleSelectTemplate,
    handleRegenerateLore, handleGenerateDrafts, handleChooseDraft,
  };
}
