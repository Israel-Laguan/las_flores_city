import { useCallback } from 'react';
import type { ContentPlan } from '@las-flores/shared';
import type { Step } from '../types';
import * as api from './useStoryBuilderApi';

type SetState<T> = (v: T | ((prev: T) => T)) => void;

interface Callbacks {
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

export function useStoryPlanApi(cb: Callbacks) {
  const { setLoading, setError, setPlan, setStep, setPlanId, description, plan } = cb;

  const handleGeneratePlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.generatePlan(description);
      if (data.success && data.data) {
        setPlan(data.data.plan);
        setStep(2);
        try {
          const saveRes = await api.savePlan(description, data.data.plan);
          if (saveRes.success && saveRes.data) setPlanId(saveRes.data.planId);
        } catch (e) { console.error('Auto-save failed:', e); }
      } else {
        setError(data.error || 'Failed to generate plan');
      }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [description, setLoading, setError, setPlan, setStep, setPlanId]);

  const handleRefine = useCallback(async (planId: string, refineFeedback: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.refinePlan(planId, refineFeedback);
      if (data.success && data.data) {
        setPlan(data.data.plan);
        cb.setRefineFeedback('');
        cb.setShowRefine(false);
      } else {
        setError(data.error || 'Failed to refine plan');
      }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [setLoading, setError, setPlan, cb]);

  const handlePreview = useCallback(async (planId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.previewPlan(planId);
      if (data.success && data.data) cb.setPreviewData(data.data);
      else setError(data.error || 'Failed to preview plan');
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [setLoading, setError, cb]);

  const handleStage = useCallback(async (planId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.stagePlan(planId);
      if (data.success) { cb.setStagingResult(data.data); setStep(4); }
      else { cb.setStagingResult(data.data); setError(data.data?.error || 'Staging failed'); }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [setLoading, setError, setStep, cb]);

  const handleApprove = useCallback(async (planId: string) => {
    setLoading(true);
    setError(null);
    try {
      if (!plan) {
        setError('No plan to approve');
        return;
      }
      const data = await api.approvePlan(planId, plan);
      if (data.success) { setStep(3); }
      else { setError(data.error || 'Approval failed'); }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [setLoading, setError, setStep, plan]);

  const handleMigrate = useCallback(async (planId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.migratePlan(planId);
      if (data.success) { cb.setMigrationResult(data.data); setStep(5); }
      else { cb.setMigrationResult(data.data); setError(data.data?.error || 'Migration failed'); }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [setLoading, setError, setStep, cb]);

  const handleRetry = useCallback(async (planId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.retryPlan(planId);
      if (data.success) { cb.setStagingResult(data.data); if (data.data?.success) setStep(4); }
      else setError(data.error || 'Retry failed');
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [setLoading, setError, setStep, cb]);

  const handleSelectTemplate = useCallback(async (templateId: string) => {
    setLoading(true);
    try {
      const data = await api.selectTemplate(templateId, description || templateId);
      if (data.success && data.data) {
        setPlan(data.data.plan);
        setStep(2);
        try {
          const saveRes = await api.savePlan(description || templateId, data.data.plan);
          if (saveRes.success && saveRes.data) setPlanId(saveRes.data.planId);
        } catch (e) { console.error('Auto-save failed:', e); }
      } else {
        setError(data.error || 'Failed to build template plan');
      }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [description, setLoading, setError, setPlan, setStep, setPlanId]);

  const handleRegenerateLore = useCallback(async (planId: string, itemId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.regenerateLore(planId, itemId);
      if (data.success && data.data) {
        // Lore was regenerated successfully - no need to update UI state
        // The LoreViewer will show the updated content on next open
      } else {
        setError(data.error || 'Failed to regenerate lore');
      }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [setLoading, setError]);

  return {
    handleGeneratePlan,
    handleRefine,
    handlePreview,
    handleStage,
    handleApprove,
    handleMigrate,
    handleRetry,
    handleSelectTemplate,
    handleRegenerateLore,
  };
}
