'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { cn } from '@las-flores/ui';
import { useGuardedNavigation } from '@/hooks/useUnsafeNavigationGuard';
import Stepper from './components/Stepper';
import EditStep from './components/steps/EditStep';
import ValidateStep from './components/steps/ValidateStep';
import MigrateStep from './components/steps/MigrateStep';
import AssetsStep from './components/steps/AssetsStep';
import PublishStep from './components/steps/PublishStep';
import { usePipeline, STEP_LABELS, ALL_STEPS } from './hooks/usePipeline';
import styles from './pipeline.module.css';

function StepContent({ pipeline }: { pipeline: ReturnType<typeof usePipeline> }) {
  const { currentStep } = pipeline;
  if (currentStep === 'edit') return <EditStep />;
  if (currentStep === 'validate') {
    return (
      <ValidateStep
        validationResult={pipeline.validationResult}
        validationError={pipeline.validationError}
        validating={pipeline.validating}
        onValidate={pipeline.runValidation}
      />
    );
  }
  if (currentStep === 'migrate') {
    return (
      <MigrateStep
        migrationStatus={pipeline.migrationStatus}
        migrationResult={pipeline.migrationResult}
        migrationError={pipeline.migrationError}
        migrating={pipeline.migrating}
        onMigrate={pipeline.runMigration}
        onFetchStatus={pipeline.fetchMigrationStatus}
      />
    );
  }
  if (currentStep === 'assets') {
    return (
      <AssetsStep
        assetCoverage={pipeline.assetCoverage}
        loading={pipeline.assetCoverageLoading}
        onFetch={pipeline.fetchAssetCoverage}
      />
    );
  }
  if (currentStep === 'publish') {
    return (
      <PublishStep
        statuses={pipeline.promotionStatuses}
        loading={pipeline.promotionLoading}
        publishing={pipeline.publishing}
        publishError={pipeline.publishError}
        promotionError={pipeline.promotionError}
        onFetchStatus={pipeline.fetchPromotionStatus}
        onPublish={pipeline.runPublish}
        onPromoteStaging={pipeline.promoteStaging}
        onPromoteProduction={pipeline.promoteProduction}
        onRollbackStaging={pipeline.rollbackStaging}
      />
    );
  }
  return null;
}

export default function PipelinePage() {
  const searchParams = useSearchParams();
  const { push: guardedPush } = useGuardedNavigation();

  const stepParam = searchParams.get('step');
  const urlStepIdx = stepParam !== null ? parseInt(stepParam, 10) : 0;
  const initialStepIdx = Number.isFinite(urlStepIdx) ? Math.min(Math.max(urlStepIdx, 0), ALL_STEPS.length - 1) : 0;
  const pipeline = usePipeline(initialStepIdx);

  useEffect(() => {
    const targetIdx = Number.isFinite(urlStepIdx) ? Math.min(Math.max(urlStepIdx, 0), ALL_STEPS.length - 1) : 0;
    if (targetIdx !== pipeline.currentStepIdx) {
      pipeline.goToStep(targetIdx);
    }
  }, [stepParam, pipeline, urlStepIdx]);

  const handleStepClick = useCallback((idx: number) => {
    pipeline.goToStep(idx);
    guardedPush(`/pipeline?step=${idx}`);
  }, [pipeline, guardedPush]);

  const steps = ALL_STEPS.map((step, i) => ({
    order: i,
    label: STEP_LABELS[step].label,
    description: STEP_LABELS[step].description,
  }));

  const blockedSteps: Record<number, string | null> = {};
  if (pipeline.currentStep === 'validate' && pipeline.hasValidationErrors) {
    blockedSteps[ALL_STEPS.indexOf('migrate')] = 'Fix validation errors before migrating';
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
        <StepContent pipeline={pipeline} />
      </div>

      {/* Navigation buttons */}
      <div className={styles.navButtons}>
        {pipeline.currentStepIdx > 0 && (
          <button
            onClick={() => {
              pipeline.goBack();
              guardedPush(`/pipeline?step=${pipeline.currentStepIdx - 1}`);
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
              guardedPush(`/pipeline?step=${pipeline.currentStepIdx + 1}`);
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
