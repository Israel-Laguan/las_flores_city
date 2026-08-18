/**
 * M29 — CritiqueOverlay "Copy to Chat": the (previously disabled) affordance now
 * opens the global chat side-panel scoped to the annotation, or honors an
 * explicit `onCopyToChat` override when supplied.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CritiqueAnnotation } from '@las-flores/shared';
import CritiqueOverlay from '../components/CritiqueOverlay';
import { ChatPanelContext, type ChatPanelContextValue } from '@/components/ChatPanelContext';

const PLAN_ID = 'f0000000-4000-4000-8000-0000000000aa';

function annotation(overrides: Partial<CritiqueAnnotation> = {}): CritiqueAnnotation {
  return {
    id: 'f0000000-4000-4000-8000-0000000000bb',
    type: 'conflict',
    severity: 'error',
    description: 'Diego collides with canonical canon.',
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

function renderWithPanel(ui: React.ReactElement, overrides: Partial<ChatPanelContextValue> = {}) {
  return render(
    <ChatPanelContext.Provider
      value={{
        isOpen: false,
        context: null,
        openWithAnnotation: vi.fn(),
        openForPlan: vi.fn(),
        close: vi.fn(),
        ...overrides,
      }}
    >
      {ui}
    </ChatPanelContext.Provider>,
  );
}

describe('CritiqueOverlay', () => {
  it('returns null when there are no annotations', () => {
    renderWithPanel(<CritiqueOverlay annotations={[]} />);
    expect(screen.queryByText(/AI Critique/)).not.toBeInTheDocument();
  });

  it('renders annotation cards with severity badge + description', () => {
    renderWithPanel(<CritiqueOverlay annotations={[annotation()]} />);
    expect(screen.getByText('Diego collides with canonical canon.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').some((b) => b.textContent?.includes('Copy to Chat'))).toBe(true);
  });

  it('opens the chat panel with the annotation when Copy to Chat is clicked', () => {
    const ann = annotation();
    const openWithAnnotation = vi.fn();
    renderWithPanel(<CritiqueOverlay annotations={[ann]} />, { openWithAnnotation });

    fireEvent.click(screen.getByRole('button', { name: /Copy to Chat/ }));
    expect(openWithAnnotation).toHaveBeenCalledTimes(1);
    expect(openWithAnnotation).toHaveBeenCalledWith(PLAN_ID, ann);
  });

  it('prefers the explicit onCopyToChat override over the panel context', () => {
    const ann = annotation();
    const onCopyToChat = vi.fn();
    const openWithAnnotation = vi.fn();
    renderWithPanel(<CritiqueOverlay annotations={[ann]} onCopyToChat={onCopyToChat} />, { openWithAnnotation });

    fireEvent.click(screen.getByRole('button', { name: /Copy to Chat/ }));
    expect(onCopyToChat).toHaveBeenCalledTimes(1);
    expect(onCopyToChat).toHaveBeenCalledWith(ann);
    expect(openWithAnnotation).not.toHaveBeenCalled();
  });
});