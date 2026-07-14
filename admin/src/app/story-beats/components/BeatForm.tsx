'use client';

import styles from './BeatForm.module.css';
import { cn } from '@/lib/cn';

interface BeatFormProps {
  formSlug: string;
  formLabel: string;
  formOrder: string;
  formDescription: string;
  submitting: boolean;
  onSlugChange: (v: string) => void;
  onLabelChange: (v: string) => void;
  onOrderChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function BeatForm({
  formSlug, formLabel, formOrder, formDescription, submitting,
  onSlugChange, onLabelChange, onOrderChange, onDescriptionChange, onSubmit,
}: BeatFormProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Add New Beat</h2>
      <form onSubmit={onSubmit}>
        <div className={styles.formGrid}>
          <div>
            <label htmlFor="formSlug" className={styles.label}>Slug</label>
            <input id="formSlug" type="text" value={formSlug} onChange={e => onSlugChange(e.target.value)} required pattern="[a-z][a-z0-9_]*" title="Slug must start with a lowercase letter and contain only lowercase letters, digits, and underscores" placeholder="e.g. act_1_intro" className={styles.input} />
          </div>
          <div>
            <label htmlFor="formLabel" className={styles.label}>Label</label>
            <input id="formLabel" type="text" value={formLabel} onChange={e => onLabelChange(e.target.value)} required placeholder="Human-readable label" className={styles.input} />
          </div>
          <div>
            <label htmlFor="formOrder" className={styles.label}>Order</label>
            <input id="formOrder" type="number" value={formOrder} onChange={e => onOrderChange(e.target.value)} required min={0} placeholder="0" className={styles.input} />
          </div>
          <div>
            <label htmlFor="formDescription" className={styles.label}>Description</label>
            <input id="formDescription" type="text" value={formDescription} onChange={e => onDescriptionChange(e.target.value)} required placeholder="Short description" className={styles.input} />
          </div>
          <div>
            <button type="submit" disabled={submitting} className={cn(styles.button, submitting ? styles.disabledButton : styles.primaryButton)}>
              {submitting ? '...' : '+ Add Beat'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
