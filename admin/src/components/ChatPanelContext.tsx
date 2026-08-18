'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CritiqueAnnotation } from '@las-flores/shared';

// M29 — global chat side-panel state. Rendered once in AdminShell so it docks on
// any admin page. `context.annotation` is present only when the panel was opened
// from a conflict or suggestion via "Copy to Chat" (its `annotationId` is then
// carried into propose/apply so the resolved item is marked 'addressed').
// The annotation `type` is preserved so ChatPanel can branch on conflict vs.
// suggestion guidance (see M26).
export interface ChatPanelContextValue {
  isOpen: boolean;
  context: { planId: string; annotation: CritiqueAnnotation | null } | null;
  openWithAnnotation: (planId: string, annotation: CritiqueAnnotation) => void;
  openForPlan: (planId: string) => void;
  close: () => void;
}

const defaultValue: ChatPanelContextValue = {
  isOpen: false,
  context: null,
  openWithAnnotation: () => {},
  openForPlan: () => {},
  close: () => {},
};

export const ChatPanelContext = createContext<ChatPanelContextValue>(defaultValue);

export function useChatPanel(): ChatPanelContextValue {
  return useContext(ChatPanelContext);
}

/** Owns the global chat-panel state; wraps every admin page under AdminShell. */
export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<ChatPanelContextValue['context']>(null);

  const value = useMemo<ChatPanelContextValue>(() => ({
    isOpen,
    context,
    openWithAnnotation: (planId, annotation) => {
      setContext({ planId, annotation });
      setIsOpen(true);
    },
    openForPlan: (planId) => {
      setContext({ planId, annotation: null });
      setIsOpen(true);
    },
    close: () => setIsOpen(false),
  }), [isOpen, context]);

  return <ChatPanelContext.Provider value={value}>{children}</ChatPanelContext.Provider>;
}