'use client';

import { cn } from '@las-flores/ui';
import styles from './Stepper.module.css';

export interface StepDef {
  /** 0-based order */
  order: number;
  label: string;
  description: string;
}

interface StepperProps {
  steps: StepDef[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  /** Per-step blocking reason; `null` = not blocked */
  blockedSteps?: Record<number, string | null>;
}

export default function Stepper({ steps, currentStep, onStepClick, blockedSteps }: StepperProps) {
  return (
    <nav className={styles.stepper} aria-label="Pipeline steps">
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isCurrent = i === currentStep;
        const isBlocked = blockedSteps?.[i] != null;
        const isClickable = !!onStepClick && i <= currentStep;

        return (
          <div key={step.order} className={styles.stepGroup}>
            <button
              type="button"
              className={cn(
                styles.stepDot,
                isCurrent && !isBlocked && styles.stepActive,
                isDone && styles.stepDone,
                isBlocked && styles.stepBlocked,
              )}
              disabled={!isClickable}
              onClick={() => onStepClick?.(i)}
              aria-current={isCurrent ? 'step' : undefined}
              title={isBlocked ? blockedSteps[i] ?? step.label : step.label}
            >
              {isDone ? '✓' : isBlocked ? '!' : i + 1}
            </button>
            {onStepClick ? (
              <button
                type="button"
                className={cn(
                  styles.stepLabel,
                  isCurrent && styles.stepLabelActive,
                  isDone && !isCurrent && styles.stepLabelDone,
                )}
                disabled={!isClickable}
                onClick={() => onStepClick?.(i)}
              >
                {step.label}
              </button>
            ) : (
              <span
                className={cn(
                  styles.stepLabel,
                  isCurrent && styles.stepLabelActive,
                )}
              >
                {step.label}
              </span>
            )}
            {i < steps.length - 1 && (
              <div className={cn(styles.stepLine, isDone && styles.stepLineDone)} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
