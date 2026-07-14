import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import StoryBuilderPlans from '../page';

// Mock the API module
vi.mock('../../hooks/useStoryBuilderApi', () => ({
  listPlans: vi.fn(),
  deletePlan: vi.fn(),
}));

import { listPlans } from '../../hooks/useStoryBuilderApi';

describe('StoryBuilderPlans', () => {
  it('should show loading state initially', () => {
    vi.mocked(listPlans).mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<StoryBuilderPlans />);
    expect(screen.getByText('Loading plans...')).toBeInTheDocument();
  });

  it('should render plans list', async () => {
    vi.mocked(listPlans).mockResolvedValue({
      success: true,
      data: {
        plans: [
          {
            id: 'plan-1',
            description: 'Test Plan',
            status: 'proposed',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
            item_count: 3,
          },
        ],
        total: 1,
      },
    });

    render(<StoryBuilderPlans />);

    await waitFor(() => {
      expect(screen.getByText('Test Plan')).toBeInTheDocument();
    });

    expect(screen.getByText('proposed')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should show empty state when no plans', async () => {
    vi.mocked(listPlans).mockResolvedValue({
      success: true,
      data: { plans: [], total: 0 },
    });

    render(<StoryBuilderPlans />);

    await waitFor(() => {
      expect(screen.getByText(/No plans found/)).toBeInTheDocument();
    });
  });

  it('should render New Plan button linking to story-builder', async () => {
    vi.mocked(listPlans).mockResolvedValue({
      success: true,
      data: { plans: [], total: 0 },
    });

    render(<StoryBuilderPlans />);

    await waitFor(() => {
      const newPlanBtn = screen.getByText('+ New Plan');
      expect(newPlanBtn).toBeInTheDocument();
      expect(newPlanBtn.closest('a')).toHaveAttribute('href', '/story-builder');
    });
  });
});
