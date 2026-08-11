import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../hooks/useStoryBuilderApi', () => {
  const updatePlan = vi.fn(async () => ({ success: true, data: {} }));
  const refinePlan = vi.fn(async () => ({ success: true, data: { plan: { id: 'new-plan', items: [] } } }));
  const refinePlanPreview = vi.fn(async () => ({ success: true, data: { plan: { id: 'preview-plan', items: [] }, conflicts: [] } }));
  const scaffoldPlan = vi.fn(async () => ({ success: true, data: { planId: 'scaffold-plan', status: 'generating' } }));
  const approveAndSolidify = vi.fn(async () => ({ success: true, data: { status: 'verified' } }));
  const generatePlan = vi.fn(async () => ({ success: true, data: { plan: { id: 'preview', items: [] }, conflicts: [], fileConflicts: [], status: 'preview' } }));
  const savePlan = vi.fn();
  const selectTemplate = vi.fn();
  return { updatePlan, refinePlan, refinePlanPreview, scaffoldPlan, approveAndSolidify, generatePlan, savePlan, selectTemplate, __esModule: true };
});

import { createStoryPlanHandlers } from '../hooks/useStoryPlanApiHandlers';
import * as api from '../hooks/useStoryBuilderApi';
import type { ContentPlan } from '@las-flores/shared';

function makePlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    description: 'plan',
    items: [{ id: '00000000-0000-0000-0000-000000000002', type: 'character', action: 'create', name: 'Diego', slug: 'diego', fields: { title: 'Edited' }, assetNeeds: [], dependsOn: [] }],
    links: [],
    status: 'proposed',
    ...overrides,
  };
}

function makeCallbacks(extras: Record<string, unknown> = {}) {
  return {
    setLoading: vi.fn(),
    setError: vi.fn(),
    setPlan: vi.fn(),
    setStep: vi.fn(),
    setPlanId: vi.fn(),
    setRefineFeedback: vi.fn(),
    setShowRefine: vi.fn(),
    setSolidifyResult: vi.fn(),
    setConflicts: vi.fn(),
    setFileConflicts: vi.fn(),
    description: 'desc',
    plan: makePlan(),
    ...extras,
  };
}

describe('useStoryPlanApiHandlers edit fidelity (M13)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists edited plan before refine', async () => {
    const plan = makePlan();
    const handlers = renderHook(() =>
      createStoryPlanHandlers(makeCallbacks({ plan }) as any),
    ).result.current;

    await act(async () => {
      await handlers.handleRefine('plan-1', 'make it better');
    });

    expect(api.updatePlan).toHaveBeenCalledWith('plan-1', plan);
    expect(api.refinePlan).toHaveBeenCalledWith('plan-1', 'make it better');
  });

  it('persists edited plan before approve-and-solidify', async () => {
    const plan = makePlan();
    const handlers = renderHook(() =>
      createStoryPlanHandlers(makeCallbacks({ plan }) as any),
    ).result.current;

    await act(async () => {
      await handlers.handleApproveAndSolidify('plan-1');
    });

    expect(api.updatePlan).toHaveBeenCalledWith('plan-1', plan);
    expect(api.approveAndSolidify).toHaveBeenCalledWith('plan-1');
  });
});

describe('two-phase intake (M20)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generatePlan is preview-only: sets plan + conflicts, no planId, no scaffold', async () => {
    const plan = makePlan();
    const setPlan = vi.fn();
    const setStep = vi.fn();
    const setPlanId = vi.fn();
    const setConflicts = vi.fn();
    const setFileConflicts = vi.fn();
    const handlers = renderHook(() =>
      createStoryPlanHandlers(makeCallbacks({ plan, setPlan, setStep, setPlanId, setConflicts, setFileConflicts }) as any),
    ).result.current;

    await act(async () => {
      await handlers.handleGeneratePlan();
    });

    expect(api.generatePlan).toHaveBeenCalledWith('desc');
    expect(setPlan).toHaveBeenCalled();
    expect(setConflicts).toHaveBeenCalledWith([]);
    expect(setFileConflicts).toHaveBeenCalledWith([]);
    expect(setStep).toHaveBeenCalledWith(2);
    // preview-only: no planId, no scaffold
    expect(setPlanId).not.toHaveBeenCalled();
    expect(api.scaffoldPlan).not.toHaveBeenCalled();
  });

  it('handleGenerateFullPlan scaffolds the outline and adopts the planId', async () => {
    const plan = makePlan();
    const setPlan = vi.fn();
    const setStep = vi.fn();
    const setPlanId = vi.fn();
    const handlers = renderHook(() =>
      createStoryPlanHandlers(makeCallbacks({ plan, setPlan, setStep, setPlanId }) as any),
    ).result.current;

    await act(async () => {
      await handlers.handleGenerateFullPlan();
    });

    expect(api.scaffoldPlan).toHaveBeenCalledWith(plan);
    expect(setPlanId).toHaveBeenCalledWith('scaffold-plan');
    expect(setStep).toHaveBeenCalledWith(2);
  });

  it('refine of a pre-scaffold outline uses refinePlanPreview (no DB write)', async () => {
    const plan = makePlan();
    const setPlan = vi.fn();
    const setConflicts = vi.fn();
    const handlers = renderHook(() =>
      createStoryPlanHandlers(makeCallbacks({ plan, setPlan, setConflicts }) as any),
    ).result.current;

    await act(async () => {
      await handlers.handleRefine(null, 'make it darker');
    });

    expect(api.updatePlan).not.toHaveBeenCalled();
    expect(api.refinePlan).not.toHaveBeenCalled();
    expect(api.refinePlanPreview).toHaveBeenCalledWith(plan, 'make it darker');
    expect(setPlan).toHaveBeenCalled();
    expect(setConflicts).toHaveBeenCalledWith([]);
  });
});
