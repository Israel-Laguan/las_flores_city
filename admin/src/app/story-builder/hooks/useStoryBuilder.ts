'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContentPlan } from '@las-flores/shared';
import type { Step } from '../types';
import { loadPlanFromDb, fetchTemplates } from './useStoryBuilderApi';
import { useStoryPlanApi } from './useStoryPlanApi';
import * as mutations from './useStoryBuilderMutations';

interface Template {
  id: string;
  label: string;
  description: string;
  icon: string;
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
  const [stagingResult, setStagingResult] = useState<any>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  const apiCallbacks = useStoryPlanApi({
    setLoading, setError, setPlan, setStep, setPlanId,
    setRefineFeedback, setShowRefine, setPreviewData,
    setStagingResult, setMigrationResult, description, plan,
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
    setPlan(fn(plan));
  }

  return {
    step, description, setDescription, plan, loading, error, planId,
    refineFeedback, setRefineFeedback, showRefine, setShowRefine,
    stagingResult, migrationResult, previewData, templates,
    handleGeneratePlan: apiCallbacks.handleGeneratePlan,
    handleRefine: () => { if (planId) apiCallbacks.handleRefine(planId, refineFeedback); },
    handlePreview: () => { if (planId) apiCallbacks.handlePreview(planId); },
    handleStage: () => { if (planId) apiCallbacks.handleStage(planId); },
    handleApprove: () => { if (planId) apiCallbacks.handleApprove(planId); },
    handleMigrate: () => { if (planId) apiCallbacks.handleMigrate(planId); },
    handleRetry: () => { if (planId) apiCallbacks.handleRetry(planId); },
    handleSelectTemplate: apiCallbacks.handleSelectTemplate,
    handleRegenerateLore: (itemId: string) => { if (planId) apiCallbacks.handleRegenerateLore(planId, itemId); },
    updateItemField: (i: number, f: string, v: string) => applyMutation(p => mutations.updateItemField(p, i, f, v)),
    updateItemDependsOn: (i: number, d: string[]) => applyMutation(p => mutations.updateItemDependsOn(p, i, d)),
    addLink: () => applyMutation(mutations.addLink),
    updateLink: (i: number, f: string, v: string) => applyMutation(p => mutations.updateLink(p, i, f, v)),
    removeLink: (i: number) => applyMutation(p => mutations.removeLink(p, i)),
    removeItem: (i: number) => applyMutation(p => mutations.removeItem(p, i)),
    removeAssetPath: (i: number, k: string) => applyMutation(p => mutations.removeAssetPath(p, i, k)),
    addItem: () => applyMutation(mutations.addItem),
    goBack: useCallback(() => { setStep(s => (s > 1 && s < 5 ? (s - 1) as Step : s)); }, []),
    goToStage: useCallback(() => { if (plan && plan.items.length > 0 && planId) apiCallbacks.handleApprove(planId); }, [plan, planId]),
  };
}
