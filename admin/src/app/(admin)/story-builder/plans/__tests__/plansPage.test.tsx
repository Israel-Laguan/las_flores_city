import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import StoryBuilderPlans from '../page';

vi.mock('../../hooks/useStoryBuilderApi', () => ({
  listPlans: vi.fn(),
  deletePlan: vi.fn(),
  rejectPlan: vi.fn(),
  retryPlan: vi.fn(),
  verifyPlan: vi.fn(),
  stagePlan: vi.fn(),
  approveAndSolidify: vi.fn(),
  createPlanFromTemplate: vi.fn(),
}));

import {
  listPlans,
  deletePlan,
  rejectPlan,
  retryPlan,
  createPlanFromTemplate,
} from '../../hooks/useStoryBuilderApi';

const mockPlans = [
  {
    id: 'plan-1',
    description: 'Test Plan Alpha',
    status: 'proposed',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    item_count: 3,
  },
  {
    id: 'plan-2',
    description: 'Test Plan Beta',
    status: 'verified',
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-04T00:00:00Z',
    item_count: 2,
  },
  {
    id: 'plan-3',
    description: 'Failed Plan',
    status: 'failed',
    created_at: '2024-01-05T00:00:00Z',
    updated_at: '2024-01-06T00:00:00Z',
    item_count: 1,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPlans).mockResolvedValue({
    success: true,
    data: { plans: mockPlans, total: mockPlans.length, limit: 50, offset: 0 },
  });
});

// eslint-disable-next-line max-lines-per-function -- plans page test suite spans many scenarios
describe('StoryBuilderPlans', () => {
  it('should show loading state initially', () => {
    vi.mocked(listPlans).mockImplementation(() => new Promise(() => {}));
    render(<StoryBuilderPlans />);
    expect(screen.getByText('Loading plans...')).toBeInTheDocument();
  });

  it('should render plans list', async () => {
    render(<StoryBuilderPlans />);
    await waitFor(() => {
      expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
    });
    expect(screen.getAllByText('proposed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Test Plan Beta')).toBeInTheDocument();
    expect(screen.getByText('Failed Plan')).toBeInTheDocument();
  });

  it('should show empty state when no plans', async () => {
    vi.mocked(listPlans).mockResolvedValue({
      success: true,
      data: { plans: [], total: 0, limit: 50, offset: 0 },
    });
    render(<StoryBuilderPlans />);
    await waitFor(() => {
      expect(screen.getByText(/No plans found/)).toBeInTheDocument();
    });
  });

  it('should render New Plan and New from Template buttons', async () => {
    vi.mocked(listPlans).mockResolvedValue({
      success: true,
      data: { plans: [], total: 0, limit: 50, offset: 0 },
    });
    render(<StoryBuilderPlans />);
    await waitFor(() => {
      expect(screen.getByText('+ New Plan')).toBeInTheDocument();
      expect(screen.getByText('+ New from Template')).toBeInTheDocument();
    });
    expect(screen.getByText('+ New Plan').closest('a')).toHaveAttribute('href', '/story-builder');
  });

  it('should render View Report link for verified plans', async () => {
    render(<StoryBuilderPlans />);
    await waitFor(() => {
      expect(screen.getByText('Test Plan Beta')).toBeInTheDocument();
    });
    const viewReportLinks = screen.getAllByText('View Report');
    expect(viewReportLinks.length).toBeGreaterThanOrEqual(1);
    expect(viewReportLinks[0].closest('a')).toHaveAttribute('href', '/story-builder?planId=plan-2');
  });

  it('should render Resume link for non-verified plans', async () => {
    render(<StoryBuilderPlans />);
    await waitFor(() => {
      expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
    });
    const resumeLinks = screen.getAllByText('Resume');
    expect(resumeLinks.length).toBeGreaterThanOrEqual(1);
  });

  describe('filters and search', () => {
    it('should render search input', async () => {
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search plans...')).toBeInTheDocument();
      });
    });

    it('should render status filter dropdown', async () => {
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('All statuses')).toBeInTheDocument();
      });
    });

    it('should render sort controls', async () => {
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Updated')).toBeInTheDocument();
        expect(screen.getByText('\u2193 Desc')).toBeInTheDocument();
      });
    });

    it('should call listPlans with filters on status change', async () => {
      const user = userEvent.setup();
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(listPlans).toHaveBeenCalledTimes(1);
      });

      const select = screen.getAllByRole('combobox')[0];
      await user.selectOptions(select, 'failed');

      await waitFor(() => {
        expect(listPlans).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'failed', offset: 0 }),
        );
      });
    });

    it('should reset offset when filter changes', async () => {
      const user = userEvent.setup();
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(listPlans).toHaveBeenCalledTimes(1);
      });

      const select = screen.getAllByRole('combobox')[0];
      await user.selectOptions(select, 'approved');

      await waitFor(() => {
        const lastCall = vi.mocked(listPlans).mock.calls[1][0];
        expect(lastCall).toMatchObject({ offset: 0 });
      });
    });
  });

  describe('quick actions', () => {
    it('should show Retry button for failed plans', async () => {
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Failed Plan')).toBeInTheDocument();
      });
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should show Verify button for migrated plans', async () => {
      vi.mocked(listPlans).mockResolvedValue({
        success: true,
        data: {
          plans: [{ ...mockPlans[0], id: 'plan-m', status: 'migrated' }],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Verify')).toBeInTheDocument();
      });
    });

    it('should show Stage and Approve & Solidify for proposed plans', async () => {
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      expect(screen.getByText('Stage')).toBeInTheDocument();
      expect(screen.getByText('Approve & Solidify')).toBeInTheDocument();
    });

    it('should call retryPlan when Retry is clicked', async () => {
      vi.mocked(retryPlan).mockResolvedValue({ success: true });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Retry'));
      await waitFor(() => {
        expect(retryPlan).toHaveBeenCalledWith('plan-3');
      });
    });
  });

  describe('reject button', () => {
    it('should show Reject button for non-rejected plans', async () => {
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      const rejectButtons = screen.getAllByText('Reject');
      expect(rejectButtons.length).toBeGreaterThanOrEqual(1);
    });

    it('should not show Reject button for already rejected plans', async () => {
      vi.mocked(listPlans).mockResolvedValue({
        success: true,
        data: {
          plans: [{ ...mockPlans[0], status: 'rejected' }],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      expect(screen.queryByText('Reject')).not.toBeInTheDocument();
    });

    it('should call rejectPlan when Reject is clicked and confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(rejectPlan).mockResolvedValue({ success: true, data: { planId: 'plan-1', status: 'rejected' } });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      fireEvent.click(screen.getAllByText('Reject')[0]);
      await waitFor(() => {
        expect(rejectPlan).toHaveBeenCalledWith('plan-1');
      });
      vi.mocked(window.confirm).mockRestore();
    });
  });

  describe('delete button', () => {
    it('should call deletePlan when Delete is clicked and confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(deletePlan).mockResolvedValue({ success: true });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      fireEvent.click(screen.getAllByText('Delete')[0]);
      await waitFor(() => {
        expect(deletePlan).toHaveBeenCalledWith('plan-1');
      });
      vi.mocked(window.confirm).mockRestore();
    });

    it('should not call deletePlan when confirmation is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      fireEvent.click(screen.getAllByText('Delete')[0]);
      expect(deletePlan).not.toHaveBeenCalled();
      vi.mocked(window.confirm).mockRestore();
    });
  });

  describe('template modal', () => {
    it('should open template modal when New from Template is clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(createPlanFromTemplate).mockResolvedValue({
        success: false,
        error: 'Template not found',
      });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('+ New from Template')).toBeInTheDocument();
      });
      await user.click(screen.getByText('+ New from Template'));
      expect(screen.getByText('New Plan from Template')).toBeInTheDocument();
      expect(screen.getByText('Template ID')).toBeInTheDocument();
    });

    it('should close template modal when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('+ New from Template')).toBeInTheDocument();
      });
      await user.click(screen.getByText('+ New from Template'));
      expect(screen.getByText('New Plan from Template')).toBeInTheDocument();
      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByText('New Plan from Template')).not.toBeInTheDocument();
    });
  });

  describe('expand row', () => {
    it('should toggle expand on chevron click', async () => {
      const user = userEvent.setup();
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      const expandBtns = screen.getAllByText('\u25B6');
      expect(expandBtns.length).toBeGreaterThanOrEqual(1);
      await user.click(expandBtns[0]);
      expect(screen.getByText('Plan Detail')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should show error when listPlans fails', async () => {
      vi.mocked(listPlans).mockResolvedValue({
        success: false,
        error: 'Server error',
      });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('should show error when deletePlan fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(deletePlan).mockResolvedValue({ success: false, error: 'Delete failed' });
      render(<StoryBuilderPlans />);
      await waitFor(() => {
        expect(screen.getByText('Test Plan Alpha')).toBeInTheDocument();
      });
      fireEvent.click(screen.getAllByText('Delete')[0]);
      await waitFor(() => {
        expect(screen.getByText('Delete failed')).toBeInTheDocument();
      });
      vi.mocked(window.confirm).mockRestore();
    });
  });
});
