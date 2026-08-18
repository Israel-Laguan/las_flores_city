'use client';

import type { CritiqueAnnotation } from '@las-flores/shared';
import { useChatPanel } from '@/components/ChatPanelContext';
import styles from './CritiqueOverlay.module.css';

const SEVERITY_LABEL: Record<string, string> = {
  error: '🔴 Conflict',
  warning: '🟡 Warning',
  info: '🔵 Suggestion',
};

interface CritiqueOverlayProps {
  annotations: CritiqueAnnotation[];
  onDismiss?: (id: string) => void;
  /** M29: override — when omitted, "Copy to Chat" opens the global chat panel. */
  onCopyToChat?: (annotation: CritiqueAnnotation) => void;
}

/**
 * M26 — inline critique overlays for the review step.
 *
 * Renders `:Conflict` / `:Suggestion` annotations as color-coded cards with:
 *   - severity badge (error / warning / info)
 *   - AI model provenance + timestamp
 *   - evidence excerpts (anti-hallucination)
 *   - related-entity references
 *   - "Dismiss" button (live override for false-positives)
 *   - "Copy to Chat" button (M29: opens the global chat side-panel scoped to the
 *     annotation, so the author can ask/propose against its context)
 */
export default function CritiqueOverlay({ annotations, onDismiss, onCopyToChat }: CritiqueOverlayProps) {
  const { openWithAnnotation } = useChatPanel();
  if (!annotations || annotations.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>
        AI Critique — {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
      </h3>
      <div className={styles.list}>
        {annotations.map((a) => (
          <div key={a.id} className={`${styles.card} ${styles[`severity--${a.severity}`]}`}>
            <div className={styles.cardHeader}>
              <span className={styles.badge}>{SEVERITY_LABEL[a.severity] || a.type}</span>
              <span className={styles.scope}>[{a.scope}]</span>
              <span className={styles.model}>{a.aiModel}</span>
              <time className={styles.timestamp} dateTime={a.createdAt} title={a.createdAt}>
                {new Date(a.createdAt).toLocaleString()}
              </time>
            </div>

            <p className={styles.description}>{a.description}</p>

            {a.evidence.length > 0 && (
              <details className={styles.evidence}>
                <summary className={styles.evidenceSummary}>
                  Evidence ({a.evidence.length} excerpt{a.evidence.length !== 1 ? 's' : ''})
                </summary>
                {a.evidence.map((e, i) => (
                  <div key={i} className={styles.evidenceItem}>
                    <span className={styles.evidenceSource}>
                      {e.nodeType} / {e.slug}
                    </span>
                    <blockquote className={styles.quote}>{e.excerpt}</blockquote>
                  </div>
                ))}
              </details>
            )}

            {a.relatedEntities.length > 0 && (
              <div className={styles.related}>
                Related: {a.relatedEntities.map((r) => `${r.entityType}(${r.slug})`).join(', ')}
              </div>
            )}

            <div className={styles.actions}>
              {onDismiss && (
                <button
                  className={styles.dismissBtn}
                  onClick={() => onDismiss(a.id)}
                  title="Mark as false-positive (hides from overlay)"
                >
                  Dismiss
                </button>
              )}
              {/* M29 — always enabled; opens the chat panel scoped to this annotation
                      (or the passed override). Falls back to the default no-op
                      when no provider is mounted, so rendering is always safe. */}
              <button
                className={styles.chatBtn}
                title="Open a chat assistant scoped to this annotation"
                onClick={() => (onCopyToChat ? onCopyToChat(a) : openWithAnnotation(a.planId, a))}
              >
                📋 Copy to Chat
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
