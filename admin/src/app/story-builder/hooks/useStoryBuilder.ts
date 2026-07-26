'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContentPlan } from '@las-flores/shared';
import type { Step, GenerationStatus } from '../types';
import { loadPlanFromDb, fetchTemplates, fetchContentTree, refinePlan } from './useStoryBuilderApi';
import { useStoryPlanApi } from './useStoryPlanApi';
import * as mutations from './useStoryBuilderMutations';
import type { SolidifyResultLite } from '../components/ResultsStep';

interface Template {
  id: string;
  label: string;
  description: string;
  icon: string;
}

function buildHandlers(
  planId: string | null,
  refineFeedback: string,
  apiCallbacks: any,
  applyMutation: (fn: (plan: ContentPlan) => ContentPlan) => void,
  handleRefineItem: (itemId: string) => void,
  setStep: (fn: (s: Step) => Step) => void
) {
  return {
    handleGeneratePlan: apiCallbacks.handleGeneratePlan,
    handleRefine: () => { if (planId) apiCallbacks.handleRefine(planId, refineFeedback); },
    handleApproveAndSolidify: () => { if (planId) apiCallbacks.handleApproveAndSolidify(planId); },
    handleSelectTemplate: apiCallbacks.handleSelectTemplate,
    handleClone: apiCallbacks.handleClone,
    handleRegenerateLore: (itemId: string) => { if (planId) apiCallbacks.handleRegenerateLore(planId, itemId); },
    handleGenerateDrafts: async (count?: number) => { if (planId) await apiCallbacks.handleGenerateDrafts(planId, count); },
    handleChooseDraft: async (itemId: string, promptType: string, filename: string) => {
      if (planId) await apiCallbacks.handleChooseDraft(planId, itemId, promptType, filename);
    },
    updateItemField: (i: number, f: string, v: string) => applyMutation(p => mutations.updateItemField(p, i, f, v)),
    updateItemDependsOn: (i: number, d: string[]) => applyMutation(p => mutations.updateItemDependsOn(p, i, d)),
    addLink: () => applyMutation(mutations.addLink),
    updateLink: (i: number, f: string, v: string) => applyMutation(p => mutations.updateLink(p, i, f, v)),
    removeLink: (i: number) => applyMutation(p => mutations.removeLink(p, i)),
    removeItem: (i: number) => applyMutation(p => mutations.removeItem(p, i)),
    removeAssetPath: (i: number, k: string) => applyMutation(p => mutations.removeAssetPath(p, i, k)),
    addItem: () => applyMutation(mutations.addItem),
    addItemFromRoster: (entity: { name: string; type: string; description?: string }) =>
      applyMutation(p => mutations.addItemFromRoster(p, entity)),
    handleRefineItem,
    goBack: useCallback(() => { setStep(s => (s === 2 ? 1 : s) as Step); }, [setStep]),
  };
}

export function useStoryBuilder(initialPlanId: string | null) {
  const [step, setStep] = useState<Step>(1);
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [refineFeedback, setRefineFeedback] = useState('');
  const [showRefine, setShowRefine] = useState(false);
  const [solidifyResult, setSolidifyResult] = useState<SolidifyResultLite | null>(null);
  const [genStatus, setGenStatus] = useState<GenerationStatus | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contentTree, setContentTree] = useState<Array<{ path: string; name: string; type: string }>>([]);

  const apiCallbacks = useStoryPlanApi({
    setLoading, setError, setPlan, setStep, setPlanId,
    setRefineFeedback, setShowRefine, setSolidifyResult, setGenStatus,
    description, plan,
  });

  useEffect(() => {
    if (initialPlanId) {
      setPlanId(initialPlanId);
      setLoading(true);
      loadPlanFromDb(initialPlanId).then(data => {
        if (data.success && data.data) {
          setPlan(data.data.plan_json);
          setDescription(data.data.description);
          setStep(2);
        } else {
          setError(data.error || 'Failed to load plan');
        }
      }).catch((err: any) => setError(err.message)).finally(() => setLoading(false));
    }
  }, [initialPlanId]);

  useEffect(() => {
    fetchTemplates()
      .then(data => { if (data.success) setTemplates(data.data?.templates ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchContentTree()
      .then(data => { if (data.success) setContentTree(data.data?.tree ?? []); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load content tree');
      });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && step === 1 && description.trim() && !loading) {
        e.preventDefault();
        apiCallbacks.handleGeneratePlan();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && planId && step === 2) {
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, description, planId, loading, apiCallbacks.handleGeneratePlan]);

  function applyMutation(fn: (plan: ContentPlan) => ContentPlan) {
    if (!plan) return;
    try {
      setPlan(fn(plan));
    } catch (err: any) {
      setError(err.message || 'Failed to apply change');
    }
  }

  const handleRefineItem = useCallback(async (itemId: string) => {
    if (!planId || !plan || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Persist edits first
      const saveRes = await import('./useStoryBuilderApi').then(m => m.updatePlan(planId, plan));
      if (!saveRes.success) throw new Error(saveRes.error || 'Failed to save plan edits');
      const res = await refinePlan(planId, `Refine the ${plan.items.find(i => i.id === itemId)?.name || 'selected'} item`, [itemId]);
      if (res.success && res.data) {
        setPlan(res.data.plan);
        setPlanId(res.data.plan.id);
      } else {
        setError(res.error || 'Failed to refine item');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to refine item');
    } finally {
      setLoading(false);
    }
  }, [planId, plan, loading, setLoading, setError, setPlan, setPlanId]);

  const handlers = buildHandlers(planId, refineFeedback, apiCallbacks, applyMutation, handleRefineItem, setStep);

  return {
    step, description, setDescription, plan, loading, error, planId,
    refineFeedback, setRefineFeedback, showRefine, setShowRefine,
    solidifyResult, genStatus, templates, contentTree,
    ...handlers,
  };
}
