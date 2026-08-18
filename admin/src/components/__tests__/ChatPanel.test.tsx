/**
 * M29 — ChatPanel: the right-docked chat side-panel wired to the chat endpoints.
 *
 * Rendered inside a `ChatPanelContext.Provider` (as AdminShell always does), it
 * shows the conflict context header when opened from a :Conflict, exposes the
 * Ask/Propose split, and posts the full message history via adminFetch on send;
 * a successful propose surfaces the proposed-delta cards whose Apply action
 * calls the apply-delta endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CritiqueAnnotation, GraphDelta } from '@las-flores/shared';
import ChatPanel from '../ChatPanel';
import { ChatPanelContext, type ChatPanelContextValue } from '../ChatPanelContext';
import { adminFetch } from '@/lib/client-api';

vi.mock('@/lib/client-api', () => ({
  adminFetch: vi.fn(),
}));

const PLAN_ID = 'f0000000-4000-4000-8000-0000000000aa';
const ANNOTATION_ID = 'f0000000-4000-4000-8000-0000000000bb';

function annotation(overrides: Partial<CritiqueAnnotation> = {}): CritiqueAnnotation {
  return {
    id: ANNOTATION_ID,
    type: 'conflict',
    severity: 'error',
    description: 'Diego already exists in canon.',
    evidence: [{ nodeType: 'Character', nodeId: 'f0000000-4000-4000-8000-0000000000cc', slug: 'diego', excerpt: 'A weathered bartender.' }],
    relatedEntities: [],
    scope: 'entity',
    aiModel: 'mock',
    inputHash: '',
    status: 'open',
    planId: PLAN_ID,
    itemIds: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function openValue(extra?: Partial<ChatPanelContextValue>): ChatPanelContextValue {
  return {
    isOpen: true,
    context: { planId: PLAN_ID, annotation: null },
    openWithAnnotation: vi.fn(),
    openForPlan: vi.fn(),
    close: vi.fn(),
    ...extra,
  };
}

function renderOpen(value: ChatPanelContextValue) {
  return render(
    <ChatPanelContext.Provider value={value}>
      <ChatPanel />
    </ChatPanelContext.Provider>,
  );
}

beforeEach(() => {
  (adminFetch as ReturnType<typeof vi.fn>).mockReset();
});

describe('ChatPanel rendering', () => {
  it('renders the conflict context header when opened from a :Conflict', () => {
    renderOpen(openValue({ context: { planId: PLAN_ID, annotation: annotation() } }));
    expect(screen.getByText('Chat Assistant')).toBeInTheDocument();
    expect(screen.getByText('Diego already exists in canon.')).toBeInTheDocument();
    expect(screen.getByText((t) => t.includes('🔴'))).toBeInTheDocument();
  });

  it('renders the Ask/Propose split and an empty-state hint', () => {
    renderOpen(openValue());
    expect(screen.getByText('Ask')).toBeInTheDocument();
    expect(screen.getByText('Propose')).toBeInTheDocument();
    expect(screen.getByText(/Ask about this plan/)).toBeInTheDocument();
  });
});

describe('ChatPanel propose + apply loop', () => {
  const delta: GraphDelta = {
    id: 'f0000000-4000-4000-8000-0000000000dd',
    planId: PLAN_ID,
    nodeType: 'Character',
    nodeId: 'sarah',
    op: 'ADD',
    fields: { name: 'Sarah' },
    createdAt: new Date().toISOString(),
  };

  it('posts full history with mode=propose and renders the proposed-delta cards', async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      data: { mode: 'propose', reply: 'Proposed an edit.', deltas: [delta], deltaEdges: [] },
    });

    renderOpen(openValue({ context: { planId: PLAN_ID, annotation: annotation() } }));

    fireEvent.click(screen.getByText('Propose'));
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'Add a friend' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Proposed an edit.')).toBeInTheDocument();
      expect(screen.getByText('Apply deltas')).toBeInTheDocument();
    });
    // Delta diff summary (fields.name = Sarah).
    expect(screen.getByText(/Character Sarah/)).toBeInTheDocument();

    // Full ephemeral history + mode + annotation got sent to the server.
    const call = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((call as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ mode: 'propose', annotationId: ANNOTATION_ID });
    expect(body.messages[body.messages.length - 1]).toEqual({ role: 'user', content: 'Add a friend' });
  });

  it('applies the proposed delta via apply-delta and clears the proposal on success', async () => {
    (adminFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: { mode: 'propose', reply: 'Proposed an edit.', deltas: [delta], deltaEdges: [] } })
      .mockResolvedValueOnce({ success: true, data: { appliedCount: 1, mergedView: {} } });

    renderOpen(openValue());

    fireEvent.click(screen.getByText('Propose'));
    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'Add a friend' } });
    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => expect(screen.getByText('Apply deltas')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Apply deltas'));

    await waitFor(() => {
      expect(screen.getByText(/Applied 1 delta/)).toBeInTheDocument();
      expect(screen.queryByText('Apply deltas')).not.toBeInTheDocument();
    });

    const applyCall = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const applyBody = JSON.parse((applyCall as [string, { body: string }])[1].body);
    expect(applyBody.deltas[0].nodeId).toBe('sarah');
  });
});