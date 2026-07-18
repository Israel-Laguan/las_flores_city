'use client';

import { useStoryBuilder } from './hooks/useStoryBuilder';
import { cn } from '@las-flores/ui';
import StepIndicator from './components/StepIndicator';
import { useDraftManager } from './hooks/useDraftManager';
import DescribeStep from './components/DescribeStep';
import ReviewStep from './components/ReviewStep';
import ResultsStep, { type SolidifyResultLite } from './components/ResultsStep';
import Link from 'next/link';
import styles from './StoryBuilder.module.css';

interface StoryBuilderProps {
  initialPlanId: string | null;
}

export default function StoryBuilder({ initialPlanId }: StoryBuilderProps) {
  const {
    step, description, setDescription, plan, loading, error,
    refineFeedback, setRefineFeedback, showRefine, setShowRefine,
    templates,
    handleGeneratePlan, handleRefine,
    handleApproveAndSolidify, handleSelectTemplate,
    handleRegenerateLore,
    handleGenerateDrafts, handleChooseDraft,
    updateItemField, updateItemDependsOn,
    addLink, updateLink, removeLink, removeItem, removeAssetPath, addItem,
    goBack, planId, solidifyResult,
  } = useStoryBuilder(initialPlanId);

  const { draftAssetsByItem, draftLoading, onGenerateDrafts, onChooseDraft } = useDraftManager({
    planId,
    handleGenerateDrafts,
    handleChooseDraft,
  });

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Story Builder — Add / Update Content</h1>
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
          onGenerateDrafts={onGenerateDrafts}
          onChooseDraft={onChooseDraft}
          draftAssetsByItem={draftAssetsByItem}
          draftLoading={draftLoading}
          onApproveAndShip={handleApproveAndSolidify}
          approving={loading}
        />
      )}

      {step === 3 && (
        <ResultsStep result={solidifyResult as SolidifyResultLite | null} plan={plan} planId={planId} />
      )}

      <div className={styles.navBar}>
        {step === 2 && (
          <button className={cn('btn', 'btn--secondary')} onClick={goBack}>&larr; Back</button>
        )}
      </div>
    </main>
  );
}
