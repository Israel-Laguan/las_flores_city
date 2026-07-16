'use client';

import type { ContentPlan } from '@las-flores/shared';
import { cn } from '@las-flores/ui';
import * as api from '../hooks/useStoryBuilderApi';
import ContentCard from './ContentCard';
import PlanSummary from './PlanSummary';
import RefineSection from './RefineSection';
import LinksSection from './LinksSection';
import styles from './ReviewStep.module.css';

interface ReviewStepProps {
  plan: ContentPlan;
  planId: string | null;
  loading: boolean;
  onRegenerateLore: (itemId: string) => void;
  refineFeedback: string;
  setRefineFeedback: (v: string) => void;
  showRefine: boolean;
  setShowRefine: (v: boolean) => void;
  onRefine: () => void;
  onUpdateItem: (index: number, field: string, value: string) => void;
  onRemoveItem: (index: number) => void;
  onAddItem: () => void;
  onAssetPathRemove: (index: number, key: string) => void;
  onDependsOnChange: (index: number, dependsOn: string[]) => void;
  onUpdateLink: (index: number, field: string, value: string) => void;
  onAddLink: () => void;
  onRemoveLink: (index: number) => void;
  onGenerateDrafts?: (count?: number) => void;
  onChooseDraft?: (itemId: string, promptType: string, filename: string) => void;
  draftAssetsByItem?: Record<string, api.DraftAsset[]>;
  draftLoading?: boolean;
}

export default function ReviewStep({
  plan, planId, loading, onRegenerateLore, refineFeedback, setRefineFeedback, showRefine, setShowRefine,
  onRefine, onUpdateItem, onRemoveItem, onAddItem, onAssetPathRemove,
  onDependsOnChange, onUpdateLink, onAddLink, onRemoveLink,
  onGenerateDrafts, onChooseDraft, draftAssetsByItem, draftLoading,
}: ReviewStepProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 2: Review Plan</h2>
      <p className={styles.description}>
        Review and edit the proposed content. All text fields are editable.
      </p>

      <PlanSummary plan={plan} />

      {plan.items.map((item, i) => (
        <ContentCard
          key={item.id}
          item={item}
          index={i}
          allItems={plan.items}
          planId={planId}
          disabled={loading}
          onRegenerateLore={onRegenerateLore}
          onFieldChange={onUpdateItem}
          onRemove={onRemoveItem}
          onAssetPathRemove={onAssetPathRemove}
          onDependsOnChange={onDependsOnChange}
          onGenerateDrafts={() => onGenerateDrafts?.()}
          onChooseDraft={onChooseDraft}
          draftAssets={draftAssetsByItem?.[item.id]}
          draftLoading={draftLoading}
        />
      ))}

      <button className={cn(styles.button, styles.secondaryButton)} onClick={onAddItem}>
        + Add Item
      </button>

      <RefineSection
        refineFeedback={refineFeedback}
        setRefineFeedback={setRefineFeedback}
        showRefine={showRefine}
        setShowRefine={setShowRefine}
        loading={loading}
        onRefine={onRefine}
      />

      {plan.items.length >= 2 && (
        <LinksSection
          plan={plan}
          onUpdateLink={onUpdateLink}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
        />
      )}
    </div>
  );
}
