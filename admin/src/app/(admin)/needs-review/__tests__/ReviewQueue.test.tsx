/**
 * M29 — ReviewQueue: the global needs_review triage queue.
 *
 * Loads open annotations + proposed deltas from /review-queue, renders diff-style
 * previews, and resolves rows: dismiss (keep existing) for annotation rows,
 * accept/keep-delta for delta rows. The chat-panel open handlers come from the
 * global ChatPanelContext supplied by AdminShell.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CritiqueAnnotation, GraphDelta, ReviewQueueItem } from '@las-flores/shared';
import ReviewQueue from '../ReviewQueue';
import { ChatPanelContext } from '@/components/ChatPanelContext';
import { adminFetch } from '@/lib/client-api';

vi.mock('@/lib/client-api', () => ({
  adminFetch: vi.fn(),
}));

const PLAN_ID = 'f0000000-4000-4000-8000-0000000000aa';
const ANNOTATION_ID = 'f0000000-4000-4000-8000-0000000000bb';

const conflict: CritiqueAnnotation = {
  id: ANNOTATION_ID,
  type: 'conflict',
  severity: 'error',
  description: 'Scene district contradicts canon.',
  evidence: [{ nodeType: 'Scene', nodeId: 'f0000000-4000-4000-8000-0000000000cc', slug: 'plaza', excerpt: 'central' }],
  relatedEntities: [],
  scope: 'entity',
  aiModel: 'mock',
  inputHash: '',
  status: 'open',
  planId: PLAN_ID,
  itemIds: [],
  createdAt: new Date().toISOString(),
};

const delta: GraphDelta = {
  id: 'f0000000-4000-4000-8000-0000000000dd',
  planId: PLAN_ID,
  nodeType: 'Character',
  nodeId: 'sarah',
  op: 'ADD',
  fields: { name: 'Sarah' },
  createdAt: new Date().toISOString(),
};

const items: ReviewQueueItem[] = [
  { kind: 'conflict', planId: PLAN_ID, planDescription: 'Plan description', annotation: conflict, deltaEdges: [] },
  { kind: 'delta', planId: PLAN_ID, planDescription: 'Plan description', delta, deltaEdges: [] },
];

function renderQueue() {
  return render(
    <ChatPanelContext.Provider value={{
      isOpen: false,
      context: null,
      openWithAnnotation: vi.fn(),
      openForPlan: vi.fn(),
      close: vi.fn(),
    }}>
      <ReviewQueue />
    </ChatPanelContext.Provider>,
  );
}

beforeEach(() => {
  (adminFetch as ReturnType<typeof vi.fn>).mockReset();
});

describe('ReviewQueue rendering', () => {
  it('renders conflict + delta previews', async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: true, data: { items } });
    renderQueue();

    await waitFor(() => {
      expect(screen.getByText(/⚠ conflict/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Scene district contradicts canon/)).toBeInTheDocument();
    expect(screen.getByText(/Character Sarah/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing needs review', async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: true, data: { items: [] } });
    renderQueue();
    await waitFor(() => expect(screen.getByText(/Nothing needs review/)).toBeInTheDocument());
  });
});

describe('ReviewQueue resolution actions', () => {
  it('dismisses a conflict via the existing annotations PATCH', async () => {
    (adminFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: { items } }) // list
      .mockResolvedValueOnce({ success: true });                 // PATCH dismiss

    renderQueue();
    await waitFor(() => expect(screen.getByText(/⚠ conflict/)).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Keep existing')[0]);

    await waitFor(() => expect(screen.queryByText(/⚠ conflict/)).not.toBeInTheDocument());

    const patchCall = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const [url, opts] = patchCall as [string, { method: string; body: string }];
    expect(url).toContain(`/plans/${PLAN_ID}/annotations/${ANNOTATION_ID}`);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ status: 'dismissed' });
  });

  it('accepts a delta via apply-delta POST', async () => {
    (adminFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: { items } })                    // list
      .mockResolvedValueOnce({ success: true, data: { appliedCount: 1 } });         // accept

    renderQueue();
    await waitFor(() => expect(screen.getByText(/Character Sarah/)).toBeInTheDocument());
    fireEvent.click(screen.getByText('Accept new'));

    await waitFor(() => expect(screen.queryByText(/Character Sarah/)).not.toBeInTheDocument());

    const acceptCall = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const [url, opts] = acceptCall as [string, { method: string; body: string }];
    expect(url).toContain(`/plans/${PLAN_ID}/chat/apply-delta`);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.deltas[0].nodeId).toBe('sarah');
  });
});