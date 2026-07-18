import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../hooks/useStoryBuilderApi', () => {
  const updatePlan = vi.fn(async () => ({ success: true, data: {} }));
  const refinePlan = vi.fn(async () => ({ success: true, data: { plan: { id: 'new-plan', items: [] } } }));
  const approveAndSolidify = vi.fn(async () => ({ success: true, data: { status: 'verified' } }));
  const generatePlan = vi.fn();
  const savePlan = vi.fn();
  const selectTemplate = vi.fn();
  return { updatePlan, refinePlan, approveAndSolidify, generatePlan, savePlan, selectTemplate, __esModule: true };
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

describe('useStoryPlanApiHandlers edit fidelity (M13)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists edited plan before refine', async () => {
    const plan = makePlan();
    const handlers = renderHook(() =>
      createStoryPlanHandlers({
        setLoading: vi.fn(),
        setError: vi.fn(),
        setPlan: vi.fn(),
        setStep: vi.fn(),
        setPlanId: vi.fn(),
        setRefineFeedback: vi.fn(),
        setShowRefine: vi.fn(),
        setSolidifyResult: vi.fn(),
        description: 'desc',
        plan,
      } as any),
    ).result.current;

    await act(async () => {
      await handlers.handleRefine('plan-1', 'make it better');
    });

    expect(api.updatePlan).toHaveBeenCalledWith('plan-1', plan);
    expect(api.updatePlan).toHaveBeenCalledBefore(api.refinePlan as any);
    expect(api.refinePlan).toHaveBeenCalledWith('plan-1', 'make it better');
  });

  it('persists edited plan before approve-and-solidify', async () => {
    const plan = makePlan();
    const handlers = renderHook(() =>
      createStoryPlanHandlers({
        setLoading: vi.fn(),
        setError: vi.fn(),
        setPlan: vi.fn(),
        setStep: vi.fn(),
        setPlanId: vi.fn(),
        setRefineFeedback: vi.fn(),
        setShowRefine: vi.fn(),
        setSolidifyResult: vi.fn(),
        description: 'desc',
        plan,
      } as any),
    ).result.current;

    await act(async () => {
      await handlers.handleApproveAndSolidify('plan-1');
    });

    expect(api.updatePlan).toHaveBeenCalledWith('plan-1', plan);
    expect(api.updatePlan).toHaveBeenCalledBefore(api.approveAndSolidify as any);
    expect(api.approveAndSolidify).toHaveBeenCalledWith('plan-1');
  });
});
