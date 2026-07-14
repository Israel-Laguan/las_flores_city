'use client';

import { cn } from '@/lib/cn';
import styles from './DescribeStep.module.css';

interface DescribeStepProps {
  description: string;
  setDescription: (v: string) => void;
  onGenerate: () => void;
  loading: boolean;
  templates: Array<{ id: string; label: string; description: string; icon: string }>;
  onSelectTemplate: (id: string) => void;
}

export default function DescribeStep({ description, setDescription, onGenerate, loading, templates, onSelectTemplate }: DescribeStepProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 1: Describe What You Want</h2>
      <p className={styles.description}>
        Describe the content you want to create in natural language. The AI will generate a structured plan for your review.
      </p>

      {templates.length > 0 && (
        <div className={styles.subsection}>
          <h3 className={styles.templatesTitle}>Quick Start Templates</h3>
          <div className={styles.templatesGrid}>
            {templates.map(t => (
              <button
                key={t.id}
                className={cn(styles.templateButton, loading && styles.disabledButton)}
                disabled={loading}
                onClick={() => onSelectTemplate(t.id)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <p className={styles.templateHint}>
            Click a template to generate a pre-configured plan. You can still edit everything in Step 2.
          </p>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Description *</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Add a bartender named Diego who works at the Plaza. He knows about the lithium leak and will give the player a clue if they ask the right questions."
        />
      </div>
      <button
        className={cn(styles.button, styles.primaryButton, (loading || !description.trim()) && styles.disabledButton)}
        onClick={onGenerate}
        disabled={loading || !description.trim()}
      >
        {loading ? 'Generating Plan...' : 'Generate Plan'}
      </button>
      <p className={styles.hint}>Press Ctrl+Enter to generate</p>
    </div>
  );
}
