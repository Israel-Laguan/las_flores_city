'use client';

import { cn } from '@las-flores/ui';
import type { IdentityResolution, ResolutionAlternative } from '@las-flores/shared';
import styles from './IdentityResolutionPicker.module.css';

export interface AmbiguousItem {
  /** Index into the plan's items array (for the resolver callback). */
  index: number;
  name: string;
  type: string;
  /** ReviewStep only surfaces items whose resolution is `ambiguous`. */
  resolution: Extract<IdentityResolution, { status: 'ambiguous' }>;
}

interface IdentityResolutionPickerProps {
  items: AmbiguousItem[];
  /** The author picks one alternative; the resolver then fixes the plan item. */
  onResolve: (index: number, chosen: ResolutionAlternative) => void;
  loading?: boolean;
}

/**
 * M25 — surfaces ambiguous identity resolutions for a human picker instead of
 * silently merging by name. Renders the milestone's alternatives shape, e.g.
 * `["a193 Marcus", "new: Marcus II"]`, as selectable options.
 */
export default function IdentityResolutionPicker({
  items,
  onResolve,
  loading = false,
}: IdentityResolutionPickerProps) {
  if (items.length === 0) return null;

  return (
    <div className={styles.section} data-testid="identity-resolution-picker">
      <h3 className={styles.heading}>
        🔎 {items.length} ambiguous identit{items.length === 1 ? 'y' : 'ies'} — resolve before shipping
      </h3>
      <p className={styles.hint}>
        These names match multiple existing entities (or an existing entity AND a possible new
        character). Nothing is merged automatically — pick the intended identity.
      </p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.index} className={styles.item}>
            <div className={styles.itemHeader}>
              <span className={styles.itemType}>{item.type.replace(/_/g, ' ')}</span>
              <span className={styles.itemName}>{item.name}</span>
            </div>
            <div className={styles.options} role="group" aria-label={`Resolve identity for ${item.name}`}>
              {item.resolution.alternatives.map((alt, i) => {
                const isExhausted = alt.kind === 'new' && alt.exhausted;
                return (
                  <button
                    key={`${item.index}-${i}`}
                    type="button"
                    className={cn(
                      styles.option,
                      alt.kind === 'new' && styles.optionNew,
                      isExhausted && styles.optionExhausted,
                    )}
                    disabled={loading || isExhausted}
                    onClick={() => onResolve(item.index, alt)}
                  >
                    {alt.kind === 'new' ? '＋ ' : '↳ '}
                    {alt.name}
                  </button>
                );
              })}
              {item.resolution.alternatives.some((alt) => alt.kind === 'new' && alt.exhausted) && (
                <p className={styles.exhaustedNotice} role="note">
                  All variants for this name are already in use — resolve the duplication or rename.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}