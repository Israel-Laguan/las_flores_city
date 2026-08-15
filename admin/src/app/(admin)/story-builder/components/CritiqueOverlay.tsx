'use client';

import type { CritiqueAnnotation } from '@las-flores/shared';
import styles from './CritiqueOverlay.module.css';

const SEVERITY_LABEL: Record<string, string> = {
  error: '🔴 Conflict',
  warning: '🟡 Warning',
  info: '🔵 Suggestion',
};

interface CritiqueOverlayProps {
  annotations: CritiqueAnnotation[];
  onDismiss?: (id: string) => void;
  /** M29: stub — opens a chat side-panel contextualized to this annotation */
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
 *   - "Copy to Chat" button (disabled stub until M29)
 */
export default function CritiqueOverlay({ annotations, onDismiss, onCopyToChat }: CritiqueOverlayProps) {
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
              {/* M29 stub — always shown so authors see the (disabled) affordance,
                  even before onCopyToChat is wired up. */}
              <button
                className={styles.chatBtn}
                disabled
                title="Available in a future update (M29)"
                onClick={onCopyToChat ? () => onCopyToChat(a) : undefined}
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
