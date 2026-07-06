"use client";

import { adminStyles as styles } from '@/lib/adminStyles';

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

const inputStyle: React.CSSProperties = {
  backgroundColor: '#0d0d1a',
  border: '1px solid #00ff00',
  color: '#fff',
  fontFamily: 'monospace',
  padding: '0.25rem 0.5rem',
  borderRadius: '3px',
  width: '100%',
};

export default function BeatForm({
  formSlug, formLabel, formOrder, formDescription, submitting,
  onSlugChange, onLabelChange, onOrderChange, onDescriptionChange, onSubmit,
}: BeatFormProps) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>Add New Beat</h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 2fr auto', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label htmlFor="formSlug" style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Slug</label>
            <input id="formSlug" type="text" value={formSlug} onChange={e => onSlugChange(e.target.value)} required pattern="[a-z][a-z0-9_]*" title="Slug must start with a lowercase letter and contain only lowercase letters, digits, and underscores" placeholder="e.g. act_1_intro" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="formLabel" style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Label</label>
            <input id="formLabel" type="text" value={formLabel} onChange={e => onLabelChange(e.target.value)} required placeholder="Human-readable label" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="formOrder" style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Order</label>
            <input id="formOrder" type="number" value={formOrder} onChange={e => onOrderChange(e.target.value)} required min={0} placeholder="0" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="formDescription" style={{ ...styles.muted, display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem' }}>Description</label>
            <input id="formDescription" type="text" value={formDescription} onChange={e => onDescriptionChange(e.target.value)} required placeholder="Short description" style={inputStyle} />
          </div>
          <div>
            <button type="submit" disabled={submitting} style={{ ...styles.button, ...(submitting ? styles.disabledButton : styles.primaryButton) }}>
              {submitting ? '⏳' : '+ Add Beat'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
