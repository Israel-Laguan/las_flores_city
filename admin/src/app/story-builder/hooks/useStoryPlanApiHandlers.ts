import { useCallback } from 'react';
import type { ContentPlan } from '@las-flores/shared';
import type { Step } from '../types';
import type { SolidifyResultLite } from '../components/ResultsStep';
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
  setSolidifyResult: SetState<SolidifyResultLite | null>;
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
    setRefineFeedback, setShowRefine, setSolidifyResult,
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
    const data = await withLoading(setLoading, setError, async () => {
      // Persist author edits first so refine runs against the edited plan (server
      // reloads the stored plan_json; without this, edits would be discarded).
      if (plan) {
        const saveRes = await api.updatePlan(planId, plan);
        if (!saveRes.success) {
          throw new Error(saveRes.error || 'Failed to save plan edits before refining');
        }
      }
      return api.refinePlan(planId, refineFeedback);
    });
    if (!data) return;
    if (data.success && data.data) {
      setPlan(data.data.plan);
      // refinePlan versions the plan into a new row; adopt the new id.
      setPlanId(data.data.plan.id);
      setRefineFeedback('');
      setShowRefine(false);
    } else {
      setError(data.error || 'Failed to refine plan');
    }
  }, [setLoading, setError, setPlan, setRefineFeedback, setShowRefine, setPlanId, plan]);

  const handleApproveAndSolidify = useCallback(async (planId: string) => {
    if (!planId) return;
    const data = await withLoading(setLoading, setError, async () => {
      // Persist author edits first so ship uses the edited plan. The server
      // re-parses plan_json from the DB during approve-and-solidify; without this
      // the edits would be lost.
      if (plan) {
        const saveRes = await api.updatePlan(planId, plan);
        if (!saveRes.success) {
          throw new Error(saveRes.error || 'Failed to save plan edits before shipping');
        }
      }
      return api.approveAndSolidify(planId);
    });
    if (!data) return;
    if (data.success && data.data) {
      setSolidifyResult(data.data as SolidifyResultLite);
      setPlan(plan ? ({ ...plan, status: data.data.status } as ContentPlan) : plan);
      setStep(3);
    } else {
      setSolidifyResult(data.data as SolidifyResultLite ?? null);
      setError(data.error || 'Approve & Ship failed');
      setStep(3);
    }
  }, [setLoading, setError, setStep, setPlan, setSolidifyResult, plan]);

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


  const handleClone = useCallback(async (sourcePath: string, newName: string) => {
    const data = await withLoading(setLoading, setError, () =>
      api.cloneEntity(sourcePath, newName));
    if (!data || !data.success) return;
    const newItem = data.data!.item;
    if (plan) {
      setPlan({ ...plan, items: [...plan.items, newItem] });
    } else {
      const newPlan: ContentPlan = {
        id: crypto.randomUUID(),
        description: `Cloned: ${newName}`,
        items: [newItem],
        links: [],
        status: 'draft',
      };
      setPlan(newPlan);
      setStep(2);
      api.savePlan(`Cloned: ${newName}`, newPlan)
        .then(r => { if (r.success && r.data) setPlanId(r.data.planId); })
        .catch(e => console.error('Auto-save failed:', e));
    }
  }, [plan, setLoading, setError, setPlan, setStep, setPlanId]);

  const handleRegenerateLore = useCallback(async (planId: string, itemId: string) => {
    const data = await withLoading(setLoading, setError, () => api.regenerateLore(planId, itemId));
    if (!data) return;
    await refreshPlanFromDb(planId, setPlan);
  }, [setLoading, setError, setPlan]);

  const { handleGenerateDrafts, handleChooseDraft } = createDraftPlanHandlers({ setLoading, setError, setPlan });

  return {
    handleGeneratePlan, handleRefine, handleSelectTemplate, handleClone,
    handleRegenerateLore, handleGenerateDrafts, handleChooseDraft,
    handleApproveAndSolidify,
  };
}
