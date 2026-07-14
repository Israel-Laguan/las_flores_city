/**
 * Tests for PlanSummary.tsx
 * Milestone 1: Story Builder UX Refinement
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlanSummary from '../components/PlanSummary';
import type { ContentPlan } from '@las-flores/shared';

function createPlan(overrides: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    description: 'Test plan description',
    items: [],
    links: [],
    status: 'draft',
    ...overrides,
  };
}

describe('PlanSummary rendering', () => {
  it('should render plan description', () => {
    const plan = createPlan({ description: 'Add three new characters to the story' });
    render(<PlanSummary plan={plan} />);

    expect(screen.getByText('Add three new characters to the story')).toBeInTheDocument();
  });

  it('should render Plan Summary heading', () => {
    render(<PlanSummary plan={createPlan()} />);
    expect(screen.getByText('Plan Summary')).toBeInTheDocument();
  });

  it('should show zero items when plan is empty', () => {
    render(<PlanSummary plan={createPlan({ items: [] })} />);
    // All stats show 0, verify the section exists
    expect(screen.getByText('Total Items')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.getByText('Assets Needed')).toBeInTheDocument();
  });
});

describe('PlanSummary statistics', () => {
  it('should count total items correctly', () => {
    const plan = createPlan({
      items: [
        { id: '1', type: 'character', action: 'create', name: 'A', slug: 'a', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '2', type: 'scene', action: 'update', name: 'B', slug: 'b', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '3', type: 'dialogue', action: 'create', name: 'C', slug: 'c', fields: {}, assetNeeds: [], dependsOn: [] },
      ],
    });
    render(<PlanSummary plan={plan} />);

    // Verify stats section exists with correct labels
    expect(screen.getByText('Total Items')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.getByText('Assets Needed')).toBeInTheDocument();
  });

  it('should count create actions correctly', () => {
    const plan = createPlan({
      items: [
        { id: '1', type: 'character', action: 'create', name: 'A', slug: 'a', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '2', type: 'character', action: 'create', name: 'B', slug: 'b', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '3', type: 'scene', action: 'update', name: 'C', slug: 'c', fields: {}, assetNeeds: [], dependsOn: [] },
      ],
    });
    render(<PlanSummary plan={plan} />);

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
  });

  it('should count update actions correctly', () => {
    const plan = createPlan({
      items: [
        { id: '1', type: 'character', action: 'update', name: 'A', slug: 'a', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '2', type: 'scene', action: 'create', name: 'B', slug: 'b', fields: {}, assetNeeds: [], dependsOn: [] },
      ],
    });
    render(<PlanSummary plan={plan} />);

    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
  });

  it('should count total assets needed correctly', () => {
    const plan = createPlan({
      items: [
        {
          id: '1', type: 'character', action: 'create', name: 'A', slug: 'a', fields: {},
          assetNeeds: [
            { promptType: 'portrait', targetField: 'url', status: 'pending' },
            { promptType: 'biometric', targetField: 'url', status: 'pending' },
          ],
          dependsOn: [],
        },
        {
          id: '2', type: 'scene', action: 'create', name: 'B', slug: 'b', fields: {},
          assetNeeds: [{ promptType: 'background', targetField: 'url', status: 'pending' }],
          dependsOn: [],
        },
      ],
    });
    render(<PlanSummary plan={plan} />);

    expect(screen.getByText('Assets Needed')).toBeInTheDocument();
    expect(screen.getByText('Total Items')).toBeInTheDocument();
  });
});

describe('PlanSummary type breakdown', () => {
  it('should show type breakdown badges', () => {
    const plan = createPlan({
      items: [
        { id: '1', type: 'character', action: 'create', name: 'A', slug: 'a', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '2', type: 'character', action: 'create', name: 'B', slug: 'b', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '3', type: 'scene', action: 'create', name: 'C', slug: 'c', fields: {}, assetNeeds: [], dependsOn: [] },
      ],
    });
    render(<PlanSummary plan={plan} />);

    expect(screen.getByText('character: 2')).toBeInTheDocument();
    expect(screen.getByText('scene: 1')).toBeInTheDocument();
  });

  it('should show Items by Type heading', () => {
    render(<PlanSummary plan={createPlan({ items: [] })} />);
    expect(screen.getByText('Items by Type:')).toBeInTheDocument();
  });

  it('should handle single type', () => {
    const plan = createPlan({
      items: [
        { id: '1', type: 'dialogue', action: 'create', name: 'A', slug: 'a', fields: {}, assetNeeds: [], dependsOn: [] },
      ],
    });
    render(<PlanSummary plan={plan} />);

    expect(screen.getByText('dialogue: 1')).toBeInTheDocument();
  });
});

describe('PlanSummary edge cases', () => {
  it('should handle plan with many items', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      id: `id-${i}`,
      type: 'character' as const,
      action: 'create' as const,
      name: `Character ${i}`,
      slug: `char_${i}`,
      fields: {},
      assetNeeds: [],
      dependsOn: [],
    }));
    const plan = createPlan({ items });
    render(<PlanSummary plan={plan} />);

    expect(screen.getByText('character: 50')).toBeInTheDocument();
    expect(screen.getByText('Total Items')).toBeInTheDocument();
  });

  it('should handle mixed action types', () => {
    const plan = createPlan({
      items: [
        { id: '1', type: 'character', action: 'create', name: 'A', slug: 'a', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '2', type: 'character', action: 'update', name: 'B', slug: 'b', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '3', type: 'scene', action: 'create', name: 'C', slug: 'c', fields: {}, assetNeeds: [], dependsOn: [] },
        { id: '4', type: 'scene', action: 'update', name: 'D', slug: 'd', fields: {}, assetNeeds: [], dependsOn: [] },
      ],
    });
    render(<PlanSummary plan={plan} />);

    // Verify all stat labels are present
    expect(screen.getByText('Total Items')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Updates')).toBeInTheDocument();
    expect(screen.getByText('Assets Needed')).toBeInTheDocument();
  });
});
