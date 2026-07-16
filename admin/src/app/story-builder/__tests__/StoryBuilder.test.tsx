/**
 * Milestone 04 component tests: the wizard collapsed from 5 steps to
 * Describe / Review / Approving / Results. These tests assert the new
 * "Approve & Ship" surface and the removal of the old Stage / Migrate steps.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StepIndicator from '../components/StepIndicator';
import ReviewStep from '../components/ReviewStep';
import ResultsStep from '../components/ResultsStep';
import type { ContentPlan } from '@las-flores/shared';

function createPlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    description: 'Add Diego the bartender',
    items: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        type: 'character',
        action: 'create',
        name: 'Diego',
        slug: 'diego',
        fields: { description: 'Bartender' },
        assetNeeds: [],
        dependsOn: [],
      },
    ],
    links: [],
    status: 'proposed',
    ...overrides,
  };
}

const noop = () => {};

describe('StepIndicator (Milestone 04)', () => {
  it('shows only Describe / Review / Results — no Stage or Migrate', () => {
    render(<StepIndicator step={2} />);
    expect(screen.getByText('Describe')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.queryByText('Stage')).not.toBeInTheDocument();
    expect(screen.queryByText('Migrate')).not.toBeInTheDocument();
  });
});

describe('ReviewStep (Milestone 04)', () => {
  const baseProps = {
    plan: createPlan(),
    planId: '00000000-0000-0000-0000-000000000001',
    loading: false,
    onRegenerateLore: noop,
    refineFeedback: '',
    setRefineFeedback: noop,
    showRefine: false,
    setShowRefine: noop,
    onRefine: noop,
    onUpdateItem: noop,
    onRemoveItem: noop,
    onAddItem: noop,
    onAssetPathRemove: noop,
    onDependsOnChange: noop,
    onUpdateLink: noop,
    onAddLink: noop,
    onRemoveLink: noop,
    onGenerateDrafts: noop,
    onChooseDraft: noop,
    draftAssetsByItem: {},
    draftLoading: false,
  };

  it('exposes the Approve & Ship button', () => {
    render(<ReviewStep {...baseProps} onApproveAndShip={noop} approving={false} />);
    const btn = screen.getByRole('button', { name: /approve & ship/i });
    expect(btn).toBeInTheDocument();
  });

  it('no longer exposes the old Approve Plan button', () => {
    render(<ReviewStep {...baseProps} onApproveAndShip={noop} approving={false} />);
    expect(screen.queryByRole('button', { name: /approve plan/i })).not.toBeInTheDocument();
  });
});

describe('ResultsStep (Milestone 04)', () => {
  it('shows a success banner and live-content link for a verified plan', () => {
    const result = {
      success: true,
      status: 'verified',
      stage: { success: true, itemResults: [{ name: 'Diego', status: 'success' }] },
      publish: { success: true, published: [], errors: [] },
      verificationReport: { success: true, passed: true, checks: [], errors: [] },
    };
    render(<ResultsStep result={result as any} plan={createPlan()} planId="00000000-0000-0000-0000-000000000001" />);
    expect(screen.getByText(/verified and shipped/i)).toBeInTheDocument();
    // Live content link to the character route.
    expect(screen.getByRole('link', { name: /diego/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view in db/i })).toBeInTheDocument();
  });

  it('shows a failure banner when solidify fails', () => {
    const result = {
      success: false,
      status: 'failed',
      stage: { success: true, itemResults: [] },
      publish: { success: false, published: [], errors: ['upload failed'] },
      error: 'Asset publish failed',
    };
    render(<ResultsStep result={result as any} plan={createPlan()} planId="00000000-0000-0000-0000-000000000001" />);
    expect(screen.getByText(/solidify failed/i)).toBeInTheDocument();
  });
});
