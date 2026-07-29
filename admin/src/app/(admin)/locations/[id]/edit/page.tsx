'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { YAMLLocation } from '@las-flores/shared';
import { YAMLLocationSchema } from '@las-flores/shared';
import { useEntityYaml } from '@/components/entity/useEntityYaml';
import { useEntityYamlSave } from '@/components/entity/useEntityYamlSave';
import EntityEditForm from '@/components/entity/EntityEditForm';
import { LOCATION_EDIT_FIELDS } from '../../field-definitions';
import styles from './page.module.css';

export default function LocationEditPage() {
  const params = useParams();
  const id = params.id as string;

  const { yaml, path, loading: yamlLoading, error: yamlError, refetch } = useEntityYaml<YAMLLocation>('location', id);
  const { saving, error: saveError, success: saveSuccess, save, migrate, reset: resetSave } = useEntityYamlSave();

  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  const [migrated, setMigrated] = useState(false);

  useEffect(() => {
    if (yaml && draft === null) {
      setDraft(yaml as Record<string, unknown>);
    }
  }, [yaml, draft]);

  useEffect(() => {
    if (saveSuccess) {
      setValidationErrors(null);
    }
  }, [saveSuccess]);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const parsed = YAMLLocationSchema.safeParse(draft);
    if (!parsed.success) {
      setValidationErrors(parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
      return;
    }
    setValidationErrors(null);
    if (!path) return;
    const ok = await save(path, draft);
    if (ok) {
      setMigrated(false);
    }
  }, [draft, path, save]);

  const handleMigrate = useCallback(async () => {
    const ok = await migrate();
    if (ok) {
      setMigrated(true);
      refetch();
      resetSave();
    }
  }, [migrate, refetch, resetSave]);

  if (yamlLoading) {
    return (
      <main className={styles.main}>
        <Link href={`/locations/${id}`} className={styles.backLink}>&larr; Back to Location</Link>
        <p className={styles.muted}>Loading...</p>
      </main>
    );
  }

  if (yamlError || !yaml) {
    return (
      <main className={styles.main}>
        <Link href={`/locations/${id}`} className={styles.backLink}>&larr; Back to Location</Link>
        <div className={styles.errorBox}>{yamlError || 'Not found'}</div>
      </main>
    );
  }

  const displayTitle = draft ? String(draft.name ?? yaml.name ?? id) : String(yaml.name ?? id);

  return (
    <main className={styles.main}>
      <Link href={`/locations/${id}`} className={styles.backLink}>&larr; Back to Location</Link>
      <h1>Edit Location: {displayTitle}</h1>
      {validationErrors && (
        <div className={styles.validationErrors}>
          <strong>Validation failed:</strong>
          <ul>
            {validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
        </div>
      )}
      {saveError && <div className={styles.errorBox}>{saveError}</div>}
      {saveSuccess && (
        <div className={styles.successBox}>
          Saved to YAML. Run migration to sync the DB.
          {!migrated ? (
            <button type="button" onClick={handleMigrate} disabled={saving} className="btn btn--secondary">
              {saving ? 'Migrating...' : 'Run Migration'}
            </button>
          ) : (
            <div className={styles.migrated}>
              Migration completed. <Link href={`/locations/${id}`} className={styles.link}>View updated location</Link>
            </div>
          )}
        </div>
      )}
      {draft && (
        <EntityEditForm
          fields={LOCATION_EDIT_FIELDS}
          yaml={draft}
          onChange={setDraft}
          onSubmit={handleSave}
          submitting={saving}
        />
      )}
    </main>
  );
}