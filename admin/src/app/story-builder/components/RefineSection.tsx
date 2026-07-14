'use client';

import { cn } from '@/lib/cn';
import styles from './ReviewStep.module.css';

interface RefineSectionProps {
  refineFeedback: string;
  setRefineFeedback: (v: string) => void;
  showRefine: boolean;
  setShowRefine: (v: boolean) => void;
  loading: boolean;
  onRefine: () => void;
}

export default function RefineSection({
  refineFeedback, setRefineFeedback, showRefine, setShowRefine, loading, onRefine,
}: RefineSectionProps) {
  if (!showRefine) {
    return (
      <button className={cn(styles.button, styles.secondaryButton)} style={{ marginTop: '0.5rem' }} onClick={() => setShowRefine(true)}>
        Refine with AI Feedback
      </button>
    );
  }

  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Refine with AI</h3>
      <textarea
        className={styles.textarea}
        value={refineFeedback}
        onChange={e => setRefineFeedback(e.target.value)}
        placeholder="e.g. Make Diego more cynical. Add a scene for the bar interior."
      />
      <div className={styles.refineActions}>
        <button
          className={cn(styles.button, styles.primaryButton, (loading || !refineFeedback.trim()) && 'disabled')}
          style={(loading || !refineFeedback.trim()) ? { background: '#555', color: '#999', cursor: 'not-allowed' } : undefined}
          onClick={onRefine}
          disabled={loading || !refineFeedback.trim()}
        >
          {loading ? 'Refining...' : 'Send Feedback'}
        </button>
        <button className={cn(styles.button, styles.secondaryButton)} onClick={() => setShowRefine(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
