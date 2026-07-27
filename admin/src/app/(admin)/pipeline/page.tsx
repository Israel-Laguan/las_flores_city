'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@las-flores/ui';
import Stepper from './components/Stepper';
import EditStep from './components/steps/EditStep';
import ValidateStep from './components/steps/ValidateStep';
import MigrateStep from './components/steps/MigrateStep';
import AssetsStep from './components/steps/AssetsStep';
import PublishStep from './components/steps/PublishStep';
import { usePipeline, STEP_LABELS, type PipelineStep } from './hooks/usePipeline';
import styles from './pipeline.module.css';

const ALL_STEPS: PipelineStep[] = ['edit', 'validate', 'migrate', 'assets', 'publish'];

const STEP_MAP: Record<PipelineStep, { label: string; description: string }> = {
  edit: STEP_LABELS.edit,
  validate: STEP_LABELS.validate,
  migrate: STEP_LABELS.migrate,
  assets: STEP_LABELS.assets,
  publish: STEP_LABELS.publish,
};

export default function PipelinePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pipeline = usePipeline();

  // Sync step index with URL search param
  const stepParam = searchParams.get('step');
  const urlStepIdx = stepParam !== null ? parseInt(stepParam, 10) : 0;

  // If URL is out of sync with state, push the current step
  if (urlStepIdx !== pipeline.currentStepIdx && !isNaN(urlStepIdx)) {
    // This is a render-time effect — use router.replace
    // (we handle sync via goToStep when user clicks stepper)
  }

  const handleStepClick = useCallback((idx: number) => {
    pipeline.goToStep(idx);
    router.push(`/pipeline?step=${idx}`);
  }, [pipeline, router]);

  const steps = ALL_STEPS.map((step, i) => ({
    order: i,
    label: STEP_MAP[step].label,
    description: STEP_MAP[step].description,
  }));

  const blockedSteps: Record<number, string | null> = {};
  if (pipeline.currentStepIdx === 1 && pipeline.hasValidationErrors) {
    blockedSteps[2] = 'Fix validation errors before migrating';
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.pageTitle}>Content Pipeline</h1>

      <Stepper
        steps={steps}
        currentStep={pipeline.currentStepIdx}
        onStepClick={handleStepClick}
        blockedSteps={blockedSteps}
      />

      <div className={styles.stepContainer}>
        {pipeline.currentStep === 'edit' && <EditStep />}
        {pipeline.currentStep === 'validate' && (
          <ValidateStep
            validationResult={pipeline.validationResult}
            validationError={pipeline.validationError}
            validating={pipeline.validating}
            onValidate={pipeline.runValidation}
          />
        )}
        {pipeline.currentStep === 'migrate' && (
          <MigrateStep
            migrationStatus={pipeline.migrationStatus}
            migrationResult={pipeline.migrationResult}
            migrationError={pipeline.migrationError}
            migrating={pipeline.migrating}
            onMigrate={pipeline.runMigration}
            onFetchStatus={pipeline.fetchMigrationStatus}
          />
        )}
        {pipeline.currentStep === 'assets' && (
          <AssetsStep
            assetCoverage={pipeline.assetCoverage}
            loading={pipeline.assetCoverageLoading}
            onFetch={pipeline.fetchAssetCoverage}
          />
        )}
        {pipeline.currentStep === 'publish' && (
          <PublishStep
            statuses={pipeline.promotionStatuses}
            loading={pipeline.promotionLoading}
            publishing={pipeline.publishing}
            publishError={pipeline.publishError}
            onFetchStatus={pipeline.fetchPromotionStatus}
            onPublish={pipeline.runPublish}
          />
        )}
      </div>

      {/* Navigation buttons */}
      <div className={styles.navButtons}>
        {pipeline.currentStepIdx > 0 && (
          <button
            onClick={() => {
              pipeline.goBack();
              router.push(`/pipeline?step=${pipeline.currentStepIdx - 1}`);
            }}
            className={cn(styles.button, styles.secondaryButton)}
          >
            ← Back
          </button>
        )}
        {pipeline.currentStepIdx < ALL_STEPS.length - 1 && (
          <button
            onClick={() => {
              pipeline.goNext();
              router.push(`/pipeline?step=${pipeline.currentStepIdx + 1}`);
            }}
            className={cn(
              styles.button,
              pipeline.canProceed ? styles.primaryButton : styles.disabledButton,
            )}
            disabled={!pipeline.canProceed}
            title={!pipeline.canProceed ? 'Fix validation errors first' : undefined}
          >
            Next →
          </button>
        )}
        {pipeline.currentStepIdx === ALL_STEPS.length - 1 && (
          <span className={styles.completeMessage}>All steps complete!</span>
        )}
      </div>
    </main>
  );
}
