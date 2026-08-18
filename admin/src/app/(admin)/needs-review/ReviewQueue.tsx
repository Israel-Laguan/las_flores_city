'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@las-flores/ui';
import type { ReviewQueueItem, GraphDelta, GraphDeltaEdge, CritiqueAnnotation } from '@las-flores/shared';
import { useReviewQueueApi } from './useReviewQueueApi';
import { useChatPanel } from '@/components/ChatPanelContext';
import styles from './review-queue.module.css';

const SEVERITY_COLOR: Record<string, string> = {
  error: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',
};

/** Diff-style summary: + Character sarah / ~ Dialogue <id> / − Scene <id>. */
function deltaSummary(d: GraphDelta): string {
  const sym = d.op === 'ADD' ? '+' : d.op === 'MODIFY' ? '~' : '−';
  const name = (d.fields?.name as string) || d.nodeId;
  return sym === '+' ? `+${d.nodeType} ${name}` : `${sym} ${d.nodeType} ${d.nodeId}`;
}

function shortId(s: string): string {
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

// M29 — the global needs_review triage queue: open AI annotations (conflicts +
// suggestions) ∪ all plans' proposed deltas. Per-row resolution actions map to
// the chat endpoints (§15.8): accept/keep deltas, dismiss annotations, or open
// the chat panel / the plan.
export default function ReviewQueue() {
  const { list, dismiss, acceptDelta, keepDelta } = useReviewQueueApi();
  const { openWithAnnotation, openForPlan } = useChatPanel();

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await list());
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusyKey(key);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusyKey(null);
    }
  }

    function removeItem(key: string) {
    setItems(prev => prev.filter((item) => (item.delta?.id || item.annotation?.id || item.planId) !== key));
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Needs Review</h1>
        <button className={cn('btn', 'btn--secondary', 'btn--small')} onClick={load} disabled={loading || busyKey !== null}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className={styles.subtitle}>
        Conflicts and suggestions from AI critique, plus proposed graph deltas across all plans.
      </p>

      {error && <div className="error-box">{error}</div>}
      {loading ? (
        <div className={styles.empty}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>🎉 Nothing needs review right now.</div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const key = item.delta?.id || item.annotation?.id || item.planId;
            const busy = busyKey === key;
            return item.kind === 'delta' && item.delta ? (
              <DeltaRow
                key={key}
                item={item}
                busy={busy}
                allBusy={busyKey !== null}
                onAccept={(planId, d, edges) => run(key, async () => { await acceptDelta(planId, d, edges); removeItem(key); })}
                onKeep={(planId, d) => run(key, async () => { await keepDelta(planId, d.nodeType, d.nodeId); removeItem(key); })}
                onMerge={(planId) => openForPlan(planId)}
              />
            ) : item.annotation ? (
              <AnnotationRow
                key={key}
                item={item}
                allBusy={busyKey !== null}
                onKeep={(planId, a) => run(key, async () => { await dismiss(a); removeItem(key); })}
                onMerge={() => { if (item.annotation) openWithAnnotation(item.annotation.planId, item.annotation); }}
              />
            ) : null;
          })}
        </ul>
      )}
    </div>
  );
}

function DeltaRow({
  item, busy, allBusy, onAccept, onKeep, onMerge,
}: {
  item: ReviewQueueItem;
  busy: boolean;
  allBusy: boolean;
  onAccept: (planId: string, d: GraphDelta, edges: GraphDeltaEdge[]) => void;
  onKeep: (planId: string, d: GraphDelta) => void;
  onMerge: (planId: string) => void;
}) {
  const d = item.delta!;
  const edges = item.deltaEdges ?? [];
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.preview}><code>{deltaSummary(d)}</code></span>
        <span className={styles.plan}>plan {shortId(item.planId)}</span>
        {item.planDescription && <span className={styles.planDesc}>{item.planDescription}</span>
      </div>
      {Object.keys(d.fields ?? {}).length > 0 && (
        <ul className={styles.fields}>
          {Object.entries(d.fields as Record<string, unknown>).slice(0, 4).map(([k, v]) => (
            <li key={k}><span className={styles.fieldKey}>{k}</span> = <span className={styles.fieldVal}>{typeof v === 'string' ? v : JSON.stringify(v)}</span></li>
          ))}
        </ul>
      )}
      {edges.length > 0 && (
        <ul className={styles.fields}>
          {edges.map((e, i) => (
            <li key={`edge:${i}`} className={styles.evidence}>
              <span className={styles.fieldKey}>{e.type}:</span> {shortId(e.sourceNodeId)} → {shortId(e.targetNodeId)}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button className={cn('btn', 'btn--primary', 'btn--small')} disabled={allBusy} onClick={() => onAccept(item.planId, d, edges)}>
          {busy ? '…' : 'Accept new'}
        </button>
        <button className={cn('btn', 'btn--secondary', 'btn--small')} disabled={allBusy} onClick={() => onKeep(item.planId, d)}>
          Keep existing
        </button>
        <button className={cn('btn', 'btn--secondary', 'btn--small')} disabled={allBusy} onClick={() => onMerge(item.planId)}>
          Merge
        </button>
        <Link className={cn('btn', 'btn--secondary', 'btn--small')} href={`/story-builder?planId=${item.planId}`}>
          Edit
        </Link>
      </div>
    </li>
  );
}

function AnnotationRow({
  item, allBusy, onKeep, onMerge,
}: {
  item: ReviewQueueItem;
  allBusy: boolean;
  onKeep: (planId: string, a: CritiqueAnnotation) => void;
  onMerge: () => void;
}) {
  const a = item.annotation!;
  const isConflict = a.type === 'conflict';
  const prefix = isConflict ? '⚠ conflict' : '💡 suggestion';
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.preview} style={isConflict ? { color: SEVERITY_COLOR[a.severity] } : undefined}>
          {prefix}: {a.description}
        </span>
        <span className={styles.plan}>plan {shortId(item.planId)}</span>
        {item.planDescription && <span className={styles.planDesc}>{item.planDescription}</span>}
      </div>
      {a.evidence.length > 0 && (
        <ul className={styles.fields}>
          {a.evidence.slice(0, 3).map((e, i) => (
            <li key={i} className={styles.evidence}>
              <span className={styles.fieldKey}>{e.nodeType}{e.slug ? ` ${e.slug}` : ''}:</span> {e.excerpt}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        <button className={cn('btn', 'btn--secondary', 'btn--small')} disabled={allBusy} onClick={() => onKeep(item.planId, a)}>
          Keep existing
        </button>
        <button className={cn('btn', 'btn--secondary', 'btn--small')} disabled={allBusy} onClick={onMerge}>
          Copy to Chat
        </button>
        <Link className={cn('btn', 'btn--secondary', 'btn--small')} href={`/story-builder?planId=${item.planId}`}>
          Edit
        </Link>
      </div>
    </li>
  );
}