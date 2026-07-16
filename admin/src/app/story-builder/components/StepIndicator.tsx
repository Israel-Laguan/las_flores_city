'use client';

import type { Step } from '../types';
import { cn } from '@las-flores/ui';
import styles from './StepIndicator.module.css';

// Collapsed from 5 steps (Describe → Review → Stage → Migrate → Assets) to
// Describe → Review → Results. "Approving" (step 3) is the transient state
// while the single approve-and-solidify call runs, so the indicator shows
// "Results" as in-progress.
const stepLabels = ['Describe', 'Review', 'Results'];

interface StepIndicatorProps {
  step: Step;
}

export default function StepIndicator({ step }: StepIndicatorProps) {
  return (
    <div className={styles.progressBar}>
      {stepLabels.map((label, i) => (
        <div key={i} className={styles.stepGroup}>
          <div
            className={cn(
              styles.stepDot,
              i + 1 === step ? styles.stepActive : i + 1 < step ? styles.stepDone : styles.stepPending
            )}
          >
            {i + 1 < step ? '\u2713' : i + 1}
          </div>
          <span className={cn(styles.stepLabel, i + 1 === step ? styles.stepLabelActive : styles.stepLabelInactive)}>
            {label}
          </span>
          {i < stepLabels.length - 1 && <div className={styles.stepLine} />}
        </div>
      ))}
    </div>
  );
}
