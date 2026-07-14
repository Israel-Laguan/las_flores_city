'use client';

import { cn } from '@/lib/cn';
import { SectionConfig, LinkOp } from '../types';
import styles from '../content-linker.module.css';

interface Props {
  section: SectionConfig;
  selectedData: Record<string, unknown> | null;
  available: Record<string, Array<Record<string, unknown>>>;
  onAddPendingOp: (op: LinkOp) => void;
  onGetLinkOpParams: (action: 'add' | 'remove' | 'set', section: SectionConfig, value: string) => LinkOp;
}

export default function ArrayLink({ section, selectedData, available, onAddPendingOp, onGetLinkOpParams }: Props) {
  const currentArray: string[] = (selectedData?.[section.field] as string[]) || [];
  const items = available[section.field] || [];

  const linkedIds = new Set(currentArray);
  const linked = items.filter((i: any) => linkedIds.has(i.id));
  const availableItems = items.filter((i: any) => !linkedIds.has(i.id));

  return (
    <div key={section.field} className={styles.listContainer}>
      <div className={styles.listLabel}>{section.label}</div>
      {linked.length === 0 && (
        <div className={cn(styles.listItem, styles.muted)}>No items linked</div>
      )}
      {linked.map((item: any) => (
        <div key={item.id} className={styles.listItem}>
          <span className={styles.itemName}>{item[section.nameField] || item.id}</span>
          <button
            className={cn(styles.button, styles.removeButton)}
            onClick={() => onAddPendingOp(onGetLinkOpParams('remove', section, item.id))}
          >
            Remove
          </button>
        </div>
      ))}
      {availableItems.length > 0 && (
        <div className={styles.addContainer}>
          <select
            className={styles.select}
            onChange={e => {
              if (e.target.value) {
                onAddPendingOp(onGetLinkOpParams('add', section, e.target.value));
                e.target.value = '';
              }
            }}
          >
            <option value="">Add item...</option>
            {availableItems.map((item: any) => (
              <option key={item.id} value={item.id}>{item[section.nameField] || item.id}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}