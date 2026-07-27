'use client';

import { cn } from '@las-flores/ui';
import { SectionConfig, LinkOp } from '../types';
import styles from '../content-linker.module.css';

interface Props {
  section: SectionConfig;
  selectedData: Record<string, unknown> | null;
  available: Record<string, Array<Record<string, unknown>>>;
  onAddPendingOp: (op: LinkOp) => void;
  onGetLinkOpParams: (action: 'add' | 'remove' | 'set', section: SectionConfig, value: string) => LinkOp;
}

export default function ScalarLink({ section, selectedData, available, onAddPendingOp, onGetLinkOpParams }: Props) {
  const currentValue = selectedData?.[section.field] as string | undefined;
  const items = available[section.field] || [];

  return (
    <div key={section.field} className={styles.listContainer}>
      <div className={styles.listLabel}>{section.label}</div>
      <div className={styles.listItem}>
        <span className={styles.itemName}>
          {currentValue ? (
            <>Linked: {(items.find((i: any) => i.id === currentValue)?.[section.nameField] as string) || currentValue}</>
          ) : (
            <span className={styles.muted}>Not linked</span>
          )}
        </span>
        {currentValue ? (
          <button
            className={cn(styles.button, styles.removeButton)}
            onClick={() => onAddPendingOp(onGetLinkOpParams('remove', section, currentValue))}
          >
            Remove
          </button>
        ) : (
          <select
            className={styles.select}
            onChange={e => {
              if (e.target.value) {
                onAddPendingOp(onGetLinkOpParams('set', section, e.target.value));
                e.target.value = '';
              }
            }}
          >
            <option value="">Select...</option>
            {items.map((item: any) => (
              <option key={item.id} value={item.id}>{item[section.nameField] || item.id}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}