'use client';

import type { ContentPlan } from '@las-flores/shared';
import { cn } from '@/lib/cn';
import styles from './ReviewStep.module.css';

interface LinksSectionProps {
  plan: ContentPlan;
  onUpdateLink: (index: number, field: string, value: string) => void;
  onAddLink: () => void;
  onRemoveLink: (index: number) => void;
}

export default function LinksSection({ plan, onUpdateLink, onAddLink, onRemoveLink }: LinksSectionProps) {
  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Content Links</h3>
      <p className={styles.refineHint}>
        Link content items together (e.g., scene &rarr; dialogue, mission &rarr; story).
      </p>
      {plan.links.map((link, i) => (
        <div key={i} className={styles.linkRow}>
          <select
            className={styles.select}
            style={{ flex: 1 }}
            value={link.fromItem}
            onChange={e => onUpdateLink(i, 'fromItem', e.target.value)}
          >
            {!plan.items.some(item => item.id === link.fromItem) && (
              <option value={link.fromItem}>Unknown/Deleted Item ({link.fromItem})</option>
            )}
            {plan.items.map(item => (
              <option key={item.id} value={item.id}>{item.name || item.slug} ({item.type})</option>
            ))}
          </select>
          <span className={styles.arrow}>&rarr;</span>
          <select
            className={styles.select}
            style={{ flex: 1 }}
            value={link.toItem}
            onChange={e => onUpdateLink(i, 'toItem', e.target.value)}
          >
            {!plan.items.some(item => item.id === link.toItem) && (
              <option value={link.toItem}>Unknown/Deleted Item ({link.toItem})</option>
            )}
            {plan.items.map(item => (
              <option key={item.id} value={item.id}>{item.name || item.slug} ({item.type})</option>
            ))}
          </select>
          <input
            className={styles.miniInput}
            value={link.field}
            onChange={e => onUpdateLink(i, 'field', e.target.value)}
            placeholder="field name"
          />
          <select
            className={styles.select}
            value={link.action}
            onChange={e => onUpdateLink(i, 'action', e.target.value)}
          >
            <option value="add">add</option>
            <option value="set">set</option>
          </select>
          <button
            className={styles.removeLinkButton}
            onClick={() => onRemoveLink(i)}
          >
            &#x2715;
          </button>
        </div>
      ))}
      <button className={cn(styles.button, styles.secondaryButton)} onClick={onAddLink}>
        + Add Link
      </button>
    </div>
  );
}
