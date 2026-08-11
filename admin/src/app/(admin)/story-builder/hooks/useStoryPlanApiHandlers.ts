import { useCallback } from 'react';
import type { ContentPlan } from '@las-flores/shared';
import type { IntakeConflictPreview } from '@las-flores/shared';
import type { Step, GenerationStatus } from '../types';
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
  setGenStatus: SetState<GenerationStatus | null>;
  setConflicts: SetState<IntakeConflictPreview[]>;
  setFileConflicts: SetState<string[]>;
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

async function persistGenerate(
  setPlan: SetState<ContentPlan | null>,
  setStep: SetState<Step>,
  setPlanId: SetState<string | null>,
  description: string,
  plan: ContentPlan,
) {
  setPlan(plan);
  setStep(2);
  api.savePlan(description, plan)
    .then(r => { if (r.success && r.data) setPlanId(r.data.planId); })
    .catch(e => console.error('Auto-save failed:', e));
}

function makeGeneratePlan(cb: HandlersDeps) {
  const { setLoading, setError, setPlan, setStep, setConflicts, setFileConflicts, description } = cb;
  return useCallback(async () => {
    // Cancel any pending poll timer from a previous generation
    if (_activePollTimer !== null) {
      clearTimeout(_activePollTimer);
      _activePollTimer = null;
    }

    const data = await withLoading(setLoading, setError, () => api.generatePlan(description));
    if (!data?.success || !data.data) {
      if (data) setError(data.error || 'Failed to generate plan');
      return;
    }

    // Phase 1: preview only. No planId, no scaffold, no fill. The author commits
    // via "Generate Full Plan" (handleGenerateFullPlan → POST /plan/scaffold).
    const { plan, conflicts, fileConflicts } = data.data;
    setPlan(plan);
    setConflicts(conflicts ?? []);
    setFileConflicts(fileConflicts ?? []);
    setStep(2);
  }, [description, setLoading, setError, setPlan, setStep, setConflicts, setFileConflicts]);
}

function makeGenerateFullPlan(cb: HandlersDeps) {
  const { setLoading, setError, setPlan, setStep, setPlanId, setGenStatus, plan } = cb;
  return useCallback(async () => {
    if (!plan) return;
    if (_activePollTimer !== null) {
      clearTimeout(_activePollTimer);
      _activePollTimer = null;
    }

    const data = await withLoading(setLoading, setError, () => api.scaffoldPlan(plan));
    if (!data?.success || !data.data) {
      if (data) setError(data.error || 'Failed to generate full plan');
      return;
    }

    const { planId, plan: committedPlan, status } = data.data;
    setPlan(committedPlan);
    setPlanId(planId);
    setStep(2);

    if (status === 'generating') {
      const terminalStates = ['done', 'failed', 'proposed'];
      const MAX_POLL_RETRIES = 3;
      let pollRetries = 0;
      const poll = async () => {
        try {
          const statusRes = await api.getGenerationStatus(planId);
          if (statusRes.success && statusRes.data) {
            pollRetries = 0;
            setGenStatus(statusRes.data as GenerationStatus);
            if (!terminalStates.includes(statusRes.data.status)) {
              await refreshPlanFromDb(planId, setPlan);
              _activePollTimer = setTimeout(poll, 1500);
            } else {
              await refreshPlanFromDb(planId, setPlan);
            }
          } else {
            pollRetries++;
            if (pollRetries <= MAX_POLL_RETRIES) {
              _activePollTimer = setTimeout(poll, 1500 * pollRetries);
            }
          }
        } catch (err) {
          console.warn('Generation status poll failed:', err);
          pollRetries++;
          if (pollRetries <= MAX_POLL_RETRIES) {
            _activePollTimer = setTimeout(poll, 1500 * pollRetries);
          }
        }
      };
      _activePollTimer = setTimeout(poll, 1500);
    } else {
      setGenStatus(data.data as GenerationStatus);
      await refreshPlanFromDb(planId, setPlan);
    }
  }, [plan, setLoading, setError, setPlan, setStep, setPlanId, setGenStatus]);
}

function makeRefine(cb: HandlersDeps) {
  const { setLoading, setError, setPlan, setPlanId, setRefineFeedback, setShowRefine, setConflicts, plan } = cb;
  return useCallback(async (planId: string | null, refineFeedback: string) => {
    const data = await withLoading(setLoading, setError, async () => {
      // Pre-scaffold (phase-1 outline, no planId yet): refine in-memory and re-scan
      // conflicts. No persistence, no DB write.
      if (!planId && plan) {
        return api.refinePlanPreview(plan, refineFeedback);
      }
      // Persist author edits first so refine runs against the edited plan (server
      // reloads the stored plan_json; without this, edits would be discarded).
      if (planId && plan) {
        const saveRes = await api.updatePlan(planId, plan);
        if (!saveRes.success) {
          throw new Error(saveRes.error || 'Failed to save plan edits before refining');
        }
      }
      if (!planId) return null;
      return api.refinePlan(planId, refineFeedback);
    });
    if (!data) return;
    if (data.success && data.data) {
      setPlan(data.data.plan);
      // refinePlan versions the plan into a new row; adopt the new id when present.
      if (data.data.plan.id) setPlanId(data.data.plan.id);
      if ('conflicts' in data.data && Array.isArray(data.data.conflicts)) {
        setConflicts(data.data.conflicts as IntakeConflictPreview[]);
      }
      setRefineFeedback('');
      setShowRefine(false);
    } else {
      setError(data.error || 'Failed to refine plan');
    }
  }, [setLoading, setError, setPlan, setRefineFeedback, setShowRefine, setPlanId, setConflicts, plan]);
}

function makeApproveAndSolidify(cb: HandlersDeps) {
  const { setLoading, setError, setStep, setPlan, setSolidifyResult, plan } = cb;
  return useCallback(async (planId: string) => {
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
}

function makeSelectTemplate(cb: HandlersDeps) {
  const { setLoading, setError, setPlan, setStep, setPlanId, description } = cb;
  return useCallback(async (templateId: string) => {
    const seed = description || templateId;
    const data = await withLoading(setLoading, setError, () => api.selectTemplate(templateId, seed));
    if (data?.success && data.data) {
      await persistGenerate(setPlan, setStep, setPlanId, seed, data.data.plan);
    } else if (data) {
      setError(data.error || 'Failed to build template plan');
    }
  }, [description, setLoading, setError, setPlan, setStep, setPlanId]);
}

function makeClone(cb: HandlersDeps) {
  const { setLoading, setError, setPlan, setStep, setPlanId, plan } = cb;
  return useCallback(async (sourcePath: string, newName: string) => {
    await withLoading(setLoading, setError, async () => {
      const res = await api.cloneEntity(sourcePath, newName);
      if (!res.success) return null;
      const newItem = res.data!.item;
      if (plan) {
        const updatedPlan = { ...plan, items: [...plan.items, newItem] };
        setPlan(updatedPlan);
        setStep(2);
        const saveRes = await api.savePlan(plan.description || `Cloned: ${newName}`, updatedPlan);
        if (saveRes.success && saveRes.data) setPlanId(saveRes.data.planId);
        return null;
      }
      const newPlan: ContentPlan = {
        id: crypto.randomUUID(),
        description: `Cloned: ${newName}`,
        items: [newItem],
        links: [],
        status: 'draft',
      };
      setPlan(newPlan);
      setStep(2);
      const saveRes = await api.savePlan(`Cloned: ${newName}`, newPlan);
      if (saveRes.success && saveRes.data) setPlanId(saveRes.data.planId);
      return null;
    });
  }, [plan, setLoading, setError, setPlan, setStep, setPlanId]);
}

function makeRegenerateLore(cb: HandlersDeps) {
  const { setLoading, setError, setPlan } = cb;
  return useCallback(async (planId: string, itemId: string) => {
    const data = await withLoading(setLoading, setError, () => api.regenerateLore(planId, itemId));
    if (!data) return;
    await refreshPlanFromDb(planId, setPlan);
  }, [setLoading, setError, setPlan]);
}

type HandlersDeps = Callbacks;

let _activePollTimer: ReturnType<typeof setTimeout> | null = null;

export function createStoryPlanHandlers(cb: Callbacks) {
  const {
    setLoading, setError, setPlan,
  } = cb;

  const handleGeneratePlan = makeGeneratePlan(cb);
  const handleGenerateFullPlan = makeGenerateFullPlan(cb);
  const handleRefine = makeRefine(cb);
  const handleApproveAndSolidify = makeApproveAndSolidify(cb);
  const handleSelectTemplate = makeSelectTemplate(cb);
  const handleClone = makeClone(cb);
  const handleRegenerateLore = makeRegenerateLore(cb);

  const { handleGenerateDrafts, handleChooseDraft } = createDraftPlanHandlers({ setLoading, setError, setPlan });

  return {
    handleGeneratePlan, handleGenerateFullPlan, handleRefine, handleSelectTemplate, handleClone,
    handleRegenerateLore, handleGenerateDrafts, handleChooseDraft,
    handleApproveAndSolidify,
  };
}
