import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/client-api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

const mockSearchParams = vi.fn<(key: string) => string | null>(() => null);
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockSearchParams }),
}));

import AuditPage from '../page';

beforeEach(() => {
  mockAdminFetch.mockReset();
  mockSearchParams.mockReset();
  mockSearchParams.mockImplementation(() => null);
  mockAdminFetch.mockImplementation(async (url: string) => {
    if (url.startsWith('/admin/audit/patches')) {
      return {
        success: true,
        data: [
          {
            id: 'a0000000-0000-4000-8000-000000000001',
            title: 'Add character lore',
            status: 'applied',
            conflictReason: null,
            createdAt: '2026-01-01T00:00:00Z',
            patchJson: { ops: [{ entityType: 'character', entityId: 'x', op: 'update' }] },
          },
        ],
      };
    }
    if (url.startsWith('/admin/audit/claims')) {
      return {
        success: true,
        data: [
          {
            id: 'a0000000-0000-4000-8000-000000000002',
            status: 'proposed',
            claimText: 'Hansel is a gravedigger',
            sourceSpan: 'Chapter 14',
            sourceRef: 'character:hansel',
            confidence: 0.72,
            conflictReason: null,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      };
    }
    return { success: true, data: [] };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuditPage', () => {
  it('renders patches and claims for a plan', async () => {
    mockSearchParams.mockImplementation((key) => (key === 'plan_id' ? 'a0000000-0000-4000-8000-000000000011' : null));
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Add character lore')).toBeInTheDocument();
      expect(screen.getByText('Hansel is a gravedigger')).toBeInTheDocument();
    });

    // Plan loads data only after a query is set (searchParams supplies it).
    const calledUrls = mockAdminFetch.mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u) => u.includes('/admin/audit/patches?plan_id='))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/admin/audit/claims?plan_id='))).toBe(true);
  });

  it('calls rollback endpoint when Rollback is confirmed', async () => {
    mockSearchParams.mockImplementation((key) => (key === 'plan_id' ? 'plan-1' : null));
    // Restored automatically by the afterEach vi.restoreAllMocks() hook.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AuditPage />);

    const rollbackBtn = await screen.findByRole('button', { name: /rollback/i });
    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith(
        '/admin/audit/patches/a0000000-0000-4000-8000-000000000001/rollback',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('renders an error message when data loading fails', async () => {
    mockSearchParams.mockImplementation((key) => (key === 'plan_id' ? 'plan-1' : null));
    mockAdminFetch.mockRejectedValue(new Error('Network failure'));
    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  it('shows an empty state when the query is empty', async () => {
    render(<AuditPage />);
    // The page heading is always visible; panels render only once a plan is set.
    expect(screen.getByRole('heading', { name: /audit/i })).toBeInTheDocument();
    expect(screen.queryByText('Patches / Revisions')).not.toBeInTheDocument();
    // No data requested without a plan id (query stays empty).
    expect(mockAdminFetch).not.toHaveBeenCalled();
  });
});