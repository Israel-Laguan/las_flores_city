/**
 * Tests for ConflictPreview.tsx
 * Milestone 20: two-phase intake conflict preview.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConflictPreview from '../components/ConflictPreview';
import type { IntakeConflictPreview } from '@las-flores/shared';

function conflict(overrides: Partial<IntakeConflictPreview> = {}): IntakeConflictPreview {
  return {
    type: 'duplicate_name',
    severity: 'error',
    description: 'Name collides with an existing character.',
    relatedItems: ['a0000000-e000-4000-8000-00000000000a'],
    relatedExisting: ['Diego'],
    ...overrides,
  };
}

describe('ConflictPreview — pre-scaffold (phase-1 preview)', () => {
  it('renders no-conflict state when there are no conflicts', () => {
    render(
      <ConflictPreview
        conflicts={[]}
        fileConflicts={[]}
        hasPlanId={false}
        loading={false}
        onGenerateFullPlan={vi.fn()}
        onRefineInstead={vi.fn()}
      />,
    );
    expect(screen.getByText('✓ No potential conflicts detected')).toBeInTheDocument();
    expect(screen.getByText('Generate Full Plan ↑')).toBeInTheDocument();
  });

  it('renders the conflict count and flags', () => {
    render(
      <ConflictPreview
        conflicts={[conflict()]}
        fileConflicts={['Item "X" targets existing file']}
        hasPlanId={false}
        loading={false}
        onGenerateFullPlan={vi.fn()}
        onRefineInstead={vi.fn()}
      />,
    );
    expect(screen.getByText('⚠️ 2 potential conflicts detected')).toBeInTheDocument();
    expect(screen.getByText('Blocking')).toBeInTheDocument();
    expect(screen.getByText('duplicate name')).toBeInTheDocument();
    expect(screen.getAllByText('File').length).toBeGreaterThan(0);
  });

  it('fires Generate Full Plan', () => {
    const onGenerateFullPlan = vi.fn();
    render(
      <ConflictPreview
        conflicts={[conflict()]}
        fileConflicts={[]}
        hasPlanId={false}
        loading={false}
        onGenerateFullPlan={onGenerateFullPlan}
        onRefineInstead={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Generate Full Plan ↑'));
    expect(onGenerateFullPlan).toHaveBeenCalledTimes(1);
  });

  it('fires Refine Instead', () => {
    const onRefineInstead = vi.fn();
    render(
      <ConflictPreview
        conflicts={[conflict()]}
        fileConflicts={[]}
        hasPlanId={false}
        loading={false}
        onGenerateFullPlan={vi.fn()}
        onRefineInstead={onRefineInstead}
      />,
    );
    fireEvent.click(screen.getByText('Refine Instead'));
    expect(onRefineInstead).toHaveBeenCalledTimes(1);
  });
});

describe('ConflictPreview — post-scaffold (hasPlanId)', () => {
  it('renders nothing when there are no conflicts', () => {
    const { container } = render(
      <ConflictPreview
        conflicts={[]}
        fileConflicts={[]}
        hasPlanId
        loading={false}
        onGenerateFullPlan={vi.fn()}
        onRefineInstead={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders informational conflicts without commit buttons', () => {
    render(
      <ConflictPreview
        conflicts={[conflict()]}
        fileConflicts={[]}
        hasPlanId
        loading={false}
        onGenerateFullPlan={vi.fn()}
        onRefineInstead={vi.fn()}
      />,
    );
    expect(screen.getByText('⚠️ 1 potential conflict detected')).toBeInTheDocument();
    expect(screen.queryByText('Generate Full Plan ↑')).not.toBeInTheDocument();
  });
});