'use client';

import { useState } from 'react';
import styles from './validation.module.css';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import ValidationSummary from './components/ValidationSummary';
import ErrorsByFile from './components/ErrorsByFile';
import WarningsByFile from './components/WarningsByFile';

interface ValidationError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export default function ValidationPage() {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    setValidating(true);
    setResult(null);
    setError(null);
    try {
      const data = await adminFetch<{ success: boolean; data?: ValidationResult; error?: string }>(
        '/admin/content/validate', { method: 'POST' },
      );
      if (data.success) {
        setResult(data.data ?? null);
      } else {
        setError(data.error || 'Validation failed');
      }
    } catch {
      setError('Validation request failed');
    } finally {
      setValidating(false);
    }
  };

  const errorsByFile: Record<string, ValidationError[]> = {};
  const warningsByFile: Record<string, ValidationError[]> = {};
  if (result?.errors) {
    for (const err of result.errors) {
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

  const errorCount = result?.errors?.filter(e => e.severity === 'error').length || 0;
  const warningCount = result?.errors?.filter(e => e.severity === 'warning').length || 0;

  return (
    <main className={styles.main}>
      <h1>Content Validation</h1>

      <div className={styles.buttonBar}>
        <button onClick={handleValidate} disabled={validating}
          className={cn(styles.button, validating ? styles.disabledButton : styles.primaryButton)}>
          {validating ? 'Validating...' : 'Run Validation'}
        </button>
      </div>

      {result && (
        <div className={styles.section}>
          <h2 className={styles.sectionHeading}>Validation Result</h2>
          <ValidationSummary valid={result.valid} errorCount={errorCount} warningCount={warningCount} systemWarningCount={result.warnings.length} />
          <ErrorsByFile errorsByFile={errorsByFile} />
          <WarningsByFile warningsByFile={warningsByFile} systemWarnings={result.warnings} />
          {result.valid && errorCount === 0 && warningCount === 0 && (
            <div className={styles.cleanMessage}>All content is clean — no errors or warnings.</div>
          )}
        </div>
      )}

      {error && <div className={styles.errorBox}><pre className={styles.errorPre}>{error}</pre></div>}

      {!result && !error && !validating && (
        <div className={styles.section}>
          <p className={styles.muted}>Click <strong>Run Validation</strong> to validate all content files against their schemas. Results will be grouped by file with severity indicators.</p>
        </div>
      )}
    </main>
  );
}