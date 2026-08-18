'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@las-flores/ui';
import type { ChatMessage, GraphDelta, GraphDeltaEdge } from '@las-flores/shared';
import { useChatPanel } from './ChatPanelContext';
import { useChatApi } from './useChatApi';
import styles from './ChatPanel.module.css';

const SEVERITY_LABEL: Record<string, string> = {
  error: '🔴 Conflict',
  warning: '🟡 Warning',
  info: '🔵 Suggestion',
};

/** Shorten a UUID for display without losing trailing identity. */
function shortId(s: string): string {
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

/** Diff-style one-liner for a proposed delta card. */
function deltaSummary(d: GraphDelta): string {
  const sym = d.op === 'ADD' ? '+' : d.op === 'MODIFY' ? '~' : '−';
  const name = (d.fields?.name as string) || shortId(d.nodeId);
  return `${sym} ${d.nodeType} ${name}`;
}

/** Proposed-delta list with per-delta [Discard] + a joint [Apply]. */
function ProposalBox({
  proposal, applying, onApply, onDiscard,
}: {
  proposal: { reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[] };
  applying: boolean;
  onApply: () => void;
  onDiscard: (delta: GraphDelta) => void;
}) {
  return (
    <div className={styles.proposal}>
      {proposal.deltas.map((d, i) => (
        <div key={`${d.nodeType}:${d.nodeId}:${i}`} className={styles.deltaCard}>
          <div className={styles.deltaHeader}>
            <code className={styles.deltaSummary}>{deltaSummary(d)}</code>
            <button
              className={cn('btn', 'btn--small', 'btn--danger', styles.deltaDiscard)}
              onClick={() => onDiscard(d)}
              title="Keep existing canon — remove this proposed delta"
            >
              Discard
            </button>
          </div>
          {Object.keys(d.fields ?? {}).length > 0 && (
            <ul className={styles.deltaFields}>
              {Object.entries(d.fields as Record<string, unknown>)
                .slice(0, 5)
                .map(([k, v]) => (
                  <li key={k}>
                    <span className={styles.fieldKey}>{k}</span>{' '}
                    <span className={styles.fieldVal}>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}
      {proposal.deltaEdges.map((e, i) => (
        <div key={`edge:${i}`} className={styles.edgeCard}>
          <code className={styles.edgeSummary}>
            {shortId(e.sourceNodeId)} --{e.type}--&gt; {shortId(e.targetNodeId)}
          </code>
        </div>
      ))}
      <button className={cn('btn', 'btn--primary', 'btn--small', styles.applyBtn)} onClick={onApply} disabled={applying}>
        {applying ? 'Applying…' : 'Apply deltas'}
      </button>
    </div>
  );
}

/** Ask/Propose toggle + message composer. */
function Composer({
  mode, input, sending, onMode, onInput, onSubmit,
}: {
  mode: 'explain' | 'propose';
  input: string;
  sending: boolean;
  onMode: (mode: 'explain' | 'propose') => void;
  onInput: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className={styles.composer}>
      <div className={styles.modeToggle}>
        <button className={cn(styles.modeBtn, mode === 'explain' && styles.modeBtnActive)} onClick={() => onMode('explain')} type="button">Ask</button>
        <button className={cn(styles.modeBtn, mode === 'propose' && styles.modeBtnActive)} onClick={() => onMode('propose')} type="button">Propose</button>
      </div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          className={styles.input}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder={mode === 'explain' ? 'Ask about the plan or conflict…' : 'Describe the canon change to propose…'}
          disabled={sending}
          aria-label="Chat message"
        />
        <button className={cn('btn', 'btn--primary', styles.sendBtn)} type="submit" disabled={sending || !input.trim()}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

/** Chat transcript + empty-state hint. */
function MessageList({ messages, annotationType }: { messages: ChatMessage[]; annotationType: 'conflict' | 'suggestion' | null }) {
  return (
    <div className={styles.messages}>
      {messages.length === 0 && (
        <div className={styles.empty}>
          {annotationType === 'conflict'
            ? 'Ask about this conflict, or Propose concrete canon changes to resolve it.'
            : annotationType === 'suggestion'
            ? 'Ask about this suggestion, or Propose concrete canon changes to implement it.'
            : 'Ask about this plan, or switch to Propose to request concrete canon deltas.'}
        </div>
      )}
      {messages.map((m, i) => (
        <div key={i} className={m.role === 'user' ? styles.msgUser : styles.msgAssistant}>
          <span className={styles.msgBubble}>{m.content}</span>
        </div>
      ))}
    </div>
  );
}

// M29 — right-docked chat side-panel. Rendered once by AdminShell (provider is
// global), it drives the explain/propose loop and the proposed-delta apply /
// discard actions. Deltas are revalidated server-side on apply — this panel
// never trusts the previous propose response payload.
export default function ChatPanel() {
  const { isOpen, context, close } = useChatPanel();
  const { chat, applyDelta, discardDelta } = useChatApi();

  const planId = context?.planId ?? null;
  const annotationId = context?.annotation?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'explain' | 'propose'>('explain');
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[] } | null>(null);

  const sessionKey = context ? `${context.planId}:${context.annotation?.id ?? ''}` : null;
  // Fresh session per context — history is ephemeral and starts empty.
  useEffect(() => {
    setMessages([]);
    setInput('');
    setProposal(null);
    setError(null);
  }, [sessionKey]);

  const contextHeader = useMemo(() => {
    if (!context?.annotation) return null;
    const a = context.annotation;
    return { badge: SEVERITY_LABEL[a.severity] || a.type, description: a.description, evidenceCount: a.evidence.length };
  }, [context]);

  if (!isOpen || !planId) return null;

  async function handleSend() {
    if (!planId || sending) return;
    const content = input.trim();
    if (!content) return;
    const userMsg: ChatMessage = { role: 'user', content };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setSending(true);
    setError(null);
    // Guard stale responses: capture the active context key at request start and
    // only apply the reply if the context hasn't switched mid-request.
    const requestContextKey = sessionKey;
    try {
      const r = await chat(planId, next, mode, annotationId);
      if (requestContextKey !== sessionKey) {
        // Context switched while in-flight — discard this stale response.
        return;
      }
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: r.reply || (mode === 'propose' ? '(Proposal ready — review the deltas below.)' : '') },
      ]);
      setProposal(mode === 'propose' ? r : null);
    } catch (err: any) {
      if (requestContextKey !== sessionKey) {
        // Context switched — don't surface stale errors into the new session.
        return;
      }
      setError(err?.message || String(err));
    } finally {
      setSending(false);
    }
  }

  async function handleApply() {
    if (!planId || !proposal || applying) return;
    setApplying(true);
    setError(null);
    try {
      const res = await applyDelta(planId, proposal.deltas, proposal.deltaEdges, annotationId);
      setMessages(prev => [...prev, { role: 'assistant', content: `Applied ${res.appliedCount} delta(s) — the merged revision was refreshed.` }]);
      setProposal(null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setApplying(false);
    }
  }

  async function handleDiscard(delta: GraphDelta) {
    if (!planId) return;
    setError(null);
    try {
      await discardDelta(planId, delta.nodeType, delta.nodeId);
      setProposal(prev => {
        if (!prev) return prev;
        const deltas = prev.deltas.filter((d) => d !== delta);
        // If this was the last delta, also remove connected edges so Apply doesn't send deltas: []
        const newDeltaEdges = prev.deltaEdges.filter((e) => {
          // Keep edges that don't reference the discarded delta's nodeId
          return !(e.sourceNodeType === delta.nodeType && e.sourceNodeId === delta.nodeId) &&
                 !(e.targetNodeType === delta.nodeType && e.targetNodeId === delta.nodeId);
        });
        if (deltas.length === 0 && newDeltaEdges.length === 0) return null;
        return { ...prev, deltas, deltaEdges: newDeltaEdges };
      });
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="Authoring chat assistant">
      <div className={styles.header}>
        <span className={styles.title}>Chat Assistant</span>
        <button className={cn('btn', 'btn--ghost', styles.closeBtn)} onClick={close} aria-label="Close chat" title="Close">✕</button>
      </div>

      {contextHeader && (
        <div className={styles.context}>
          <span className={styles.contextBadge}>{contextHeader.badge}</span>
          <p className={styles.contextDesc}>{contextHeader.description}</p>
          {contextHeader.evidenceCount > 0 && (
            <span className={styles.contextMeta}>{contextHeader.evidenceCount} evidence excerpt(s)</span>
          )}
        </div>
      )}

      <MessageList messages={messages} annotationType={context?.annotation?.type ?? null} />

      {proposal && (
        <ProposalBox proposal={proposal} applying={applying} onApply={handleApply} onDiscard={handleDiscard} />
      )}

      {error && <div className={styles.error}>{error}</div>}

      <Composer mode={mode} input={input} sending={sending} onMode={setMode} onInput={setInput} onSubmit={handleSend} />
    </div>
  );
}