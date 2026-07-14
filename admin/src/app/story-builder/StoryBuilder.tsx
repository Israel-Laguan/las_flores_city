'use client';

import { useStoryBuilder } from './hooks/useStoryBuilder';
import { cn } from '@las-flores/ui';
import StepIndicator from './components/StepIndicator';
import DescribeStep from './components/DescribeStep';
import ReviewStep from './components/ReviewStep';
import StageStep from './components/StageStep';
import MigrateStep from './components/MigrateStep';
import ResultsStep from './components/ResultsStep';
import Link from 'next/link';
import styles from './StoryBuilder.module.css';

interface StoryBuilderProps {
  initialPlanId: string | null;
}

export default function StoryBuilder({ initialPlanId }: StoryBuilderProps) {
  const {
    step, description, setDescription, plan, loading, error,
    refineFeedback, setRefineFeedback, showRefine, setShowRefine,
    stagingResult, migrationResult, previewData, templates,
    handleGeneratePlan, handleRefine, handlePreview, handleStage,
    handleApprove, handleMigrate, handleRetry, handleSelectTemplate,
    handleRegenerateLore,
    updateItemField, updateItemDependsOn,
    addLink, updateLink, removeLink, removeItem, removeAssetPath, addItem,
    goBack, goToStage, planId,
  } = useStoryBuilder(initialPlanId);

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Story Builder</h1>
        <Link href="/story-builder/plans" className={cn('btn', 'btn--secondary')}>
          My Plans
        </Link>
      </div>

      <StepIndicator step={step} />

      {error && <div className="error-box">{error}</div>}

      {step === 1 && (
        <DescribeStep
          description={description}
          setDescription={setDescription}
          onGenerate={handleGeneratePlan}
          loading={loading}
          templates={templates}
          onSelectTemplate={handleSelectTemplate}
        />
      )}

      {step === 2 && plan && (
        <ReviewStep
          plan={plan}
          planId={planId}
          loading={loading}
          onRegenerateLore={handleRegenerateLore}
          refineFeedback={refineFeedback}
          setRefineFeedback={setRefineFeedback}
          showRefine={showRefine}
          setShowRefine={setShowRefine}
          onRefine={handleRefine}
          onUpdateItem={updateItemField}
          onRemoveItem={removeItem}
          onAddItem={addItem}
          onAssetPathRemove={removeAssetPath}
          onDependsOnChange={updateItemDependsOn}
          onUpdateLink={updateLink}
          onAddLink={addLink}
          onRemoveLink={removeLink}
        />
      )}

      {step === 3 && (
        <StageStep
          loading={loading}
          previewData={previewData}
          stagingResult={stagingResult}
          onPreview={handlePreview}
          onStage={handleStage}
          onRetry={handleRetry}
        />
      )}

      {step === 4 && (
        <MigrateStep
          loading={loading}
          stagingResult={stagingResult}
          migrationResult={migrationResult}
          onMigrate={handleMigrate}
        />
      )}

      {step === 5 && (
        <ResultsStep migrationResult={migrationResult} />
      )}

      <div className={styles.navBar}>
        {step > 1 && step < 5 && (
          <button className={cn('btn', 'btn--secondary')} onClick={goBack}>
            &larr; Back
          </button>
        )}
        {step === 2 && (
          <button
            className={cn('btn', 'btn--primary', (!plan || !plan.items?.length) && 'btn--disabled')}
            onClick={handleApprove}
            disabled={!plan || !plan.items?.length}
          >
            Approve Plan &rarr;
          </button>
        )}
      </div>
    </main>
  );
}
