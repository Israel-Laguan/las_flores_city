'use client';

import { useState, useCallback, useMemo } from 'react';
import { adminFetch } from '@/lib/client-api';
import { usePromotion } from './usePromotion';

export type { PromotionStatus } from '@/lib/promotion';

export type PipelineStep = 'edit' | 'validate' | 'migrate' | 'assets' | 'publish';
export const ALL_STEPS: PipelineStep[] = ['edit', 'validate', 'migrate', 'assets', 'publish'];

export const STEP_LABELS: Record<PipelineStep, { label: string; description: string }> = {
  edit:     { label: 'Edit',     description: 'Create or edit content files' },
  validate: { label: 'Validate', description: 'Validate YAML against schemas' },
  migrate:  { label: 'Migrate',  description: 'Migrate content to database' },
  assets:   { label: 'Assets',   description: 'Generate and publish assets' },
  publish:  { label: 'Publish',  description: 'Promote to production' },
};

export interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface MigrationFile {
  filePath: string;
  checksum: string;
  contentType: string;
  contentId: string;
  appliedAt: string;
  appliedBy: string | null;
}

export interface MigrationStatus {
  totalFiles: number;
  byType: Record<string, MigrationFile[]>;
  files: MigrationFile[];
}

export interface AppliedMigration {
  filePath: string;
  contentType: string;
  contentId: string;
  action: 'created' | 'updated' | 'skipped';
}

export interface MigrationResult {
  success: boolean;
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  errors: string[];
  appliedMigrations: AppliedMigration[];
}

export interface CharacterAsset {
  id: string;
  name: string;
  slug: string;
  hasPortrait: boolean;
  portraitUrls: string[];
}

export interface SceneAsset {
  id: string;
  name: string;
  slug: string;
  hasBackground: boolean;
  backgroundUrl: string | null;
}

export interface PipelineAssetCoverage {
  characters: CharacterAsset[];
  scenes: SceneAsset[];
}

export type EntityRow =
  | { kind: 'character'; item: CharacterAsset }
  | { kind: 'scene'; item: SceneAsset };

export interface SetDefaultState {
  saving: boolean;
  error: string | null;
  success: boolean;
}

export function usePipeline(initialStepIdx = 0) {
  const [currentStepIdx, setCurrentStepIdx] = useState(
    Math.min(Math.max(initialStepIdx, 0), ALL_STEPS.length - 1),
  );

  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  const [assetCoverage, setAssetCoverage] = useState<PipelineAssetCoverage | null>(null);
  const [assetCoverageLoading, setAssetCoverageLoading] = useState(false);

  const promotion = usePromotion();

  const currentStep: PipelineStep = ALL_STEPS[currentStepIdx];
  const hasValidationErrors = validationResult !== null && !validationResult.valid;

  const canProceed = useMemo(() => {
    if (currentStep === 'validate' && hasValidationErrors) return false;
    return true;
  }, [currentStep, hasValidationErrors]);

  const goNext = useCallback(() => {
    if (currentStepIdx < ALL_STEPS.length - 1 && canProceed) {
      setCurrentStepIdx(i => i + 1);
    }
  }, [currentStepIdx, canProceed]);

  const goBack = useCallback(() => {
    if (currentStepIdx > 0) setCurrentStepIdx(i => i - 1);
  }, [currentStepIdx]);

  const goToStep = useCallback((idx: number) => {
    if (idx >= 0 && idx <= currentStepIdx + 1) setCurrentStepIdx(idx);
  }, [currentStepIdx]);

  const runValidation = useCallback(async () => {
    setValidating(true);
    setValidationResult(null);
    setValidationError(null);
    try {
      const data = await adminFetch<{ success: boolean; data?: ValidationResult; error?: string }>(
        '/admin/content/validate', { method: 'POST' },
      );
      if (data.success) setValidationResult(data.data ?? null);
      else setValidationError(data.error || 'Validation failed');
    } catch {
      setValidationError('Network error during validation');
    } finally {
      setValidating(false);
    }
  }, []);

  const fetchMigrationStatus = useCallback(async () => {
    try {
      const data = await adminFetch<{ success: boolean; data?: MigrationStatus }>(
        '/admin/content/status',
      );
      if (data.success) setMigrationStatus(data.data ?? null);
    } catch { /* soft */ }
  }, []);

  const runMigration = useCallback(async () => {
    setMigrating(true);
    setMigrationResult(null);
    setMigrationError(null);
    try {
      const data = await adminFetch<{ success: boolean; data?: MigrationResult; error?: string }>(
        '/admin/content/migrate', { method: 'POST' },
      );
      if (data.success) {
        setMigrationResult(data.data ?? null);
        await fetchMigrationStatus();
      } else {
        setMigrationError(data.error || 'Migration failed');
      }
    } catch {
      setMigrationError('Network error during migration');
    } finally {
      setMigrating(false);
    }
  }, [fetchMigrationStatus]);

  const fetchAssetCoverage = useCallback(async () => {
    setAssetCoverageLoading(true);
    try {
      const data = await adminFetch<{ success: boolean; data?: PipelineAssetCoverage }>('/admin/coverage/assets');
      if (data.success) setAssetCoverage(data.data ?? null);
    } catch { /* soft */ }
    finally { setAssetCoverageLoading(false); }
  }, []);

  return {
    currentStepIdx,
    currentStep: ALL_STEPS[currentStepIdx],
    goNext, goBack, goToStep, canProceed,
    validationResult, validationError, validating, runValidation,
    migrationStatus, migrationResult, migrationError, migrating, runMigration, fetchMigrationStatus,
    assetCoverage, assetCoverageLoading, fetchAssetCoverage,
    ...promotion,
    hasValidationErrors,
  };
}