'use client';

import { cn } from '@las-flores/ui';
import ValidationSummary from '@/components/validation/ValidationSummary';
import ErrorsByFile from '@/components/validation/ErrorsByFile';
import WarningsByFile from '@/components/validation/WarningsByFile';
import type { ValidationResult, ValidationError } from '../../hooks/usePipeline';
import styles from '../../pipeline.module.css';

interface Props {
  validationResult: ValidationResult | null;
  validationError: string | null;
  validating: boolean;
  onValidate: () => void;
}

export default function ValidateStep({ validationResult, validationError, validating, onValidate }: Props) {
  const errorsByFile: Record<string, ValidationError[]> = {};
  const warningsByFile: Record<string, ValidationError[]> = {};

  if (validationResult?.errors) {
    for (const err of validationResult.errors) {
      const file = err.file || 'unknown';
      if (err.severity === 'warning') {
        if (!warningsByFile[file]) warningsByFile[file] = [];
        warningsByFile[file].push(err);
      } else {
        if (!errorsByFile[file]) errorsByFile[file] = [];
        errorsByFile[file].push(err);
      }
    }
  }

  const errorCount = validationResult?.errors?.filter(e => e.severity === 'error').length || 0;
  const warningCount = validationResult?.errors?.filter(e => e.severity === 'warning').length || 0;

  return (
    <div className={styles.stepContent}>
      <h2 className={styles.stepTitle}>2. Validate Content</h2>
      <p className={styles.stepDescription}>
        Validate all YAML files against their schemas. Resolve errors before proceeding to migration.
      </p>

      <div className={styles.buttonBar}>
        <button
          onClick={onValidate}
          disabled={validating}
          className={cn(styles.button, validating ? styles.disabledButton : styles.primaryButton)}
        >
          {validating ? 'Validating...' : 'Run Validation'}
        </button>
      </div>

      {validationError && (
        <div className={styles.errorBox}>
          <pre className={styles.errorPre}>{validationError}</pre>
        </div>
      )}

      {validationResult && (
        <div className={styles.resultSection}>
          <ValidationSummary
            valid={validationResult.valid}
            errorCount={errorCount}
            warningCount={warningCount}
            systemWarningCount={validationResult.warnings.length}
          />
          <ErrorsByFile errorsByFile={errorsByFile} />
          <WarningsByFile warningsByFile={warningsByFile} systemWarnings={validationResult.warnings} />
          {validationResult.valid &&
            errorCount === 0 &&
            warningCount === 0 &&
            validationResult.warnings.length === 0 && (
              <div className={styles.cleanMessage}>All content is clean — no errors or warnings.</div>
            )}
        </div>
      )}

      {!validationResult && !validationError && !validating && (
        <p className={styles.muted}>
          Click <strong>Run Validation</strong> to validate content files.
        </p>
      )}
    </div>
  );
}
