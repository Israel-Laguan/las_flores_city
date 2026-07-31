'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useEntityYaml } from '@/components/entity/useEntityYaml';
import { useEntityYamlSave } from '@/components/entity/useEntityYamlSave';
import EntityEditForm from '@/components/entity/EntityEditForm';
import type { FieldDef } from '@/components/entity/FieldDef';
import styles from './EntityEditPage.module.css';

interface EntityEditPageProps {
  type: string;
  id: string;
  schema: { safeParse: (data: unknown) => { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
  editFields: FieldDef[];
  entityLabel: string;
  routeBase: string;
  footer?: ReactNode;
}

function SaveSuccess({ entityLabel, routeBase, id, migrated, onMigrate, saving }: { entityLabel: string; routeBase: string; id: string; migrated: boolean; onMigrate: () => void; saving: boolean }) {
  return (
    <div className={styles.successBox}>
      Saved to YAML. Run migration to sync the DB.
      {!migrated ? (
        <button type="button" onClick={onMigrate} disabled={saving} className="btn btn--secondary">
          {saving ? 'Migrating...' : 'Run Migration'}
        </button>
      ) : (
        <div className={styles.migrated}>
          Migration completed. <Link href={`/${routeBase}/${id}`} className={styles.link}>View updated {entityLabel.toLowerCase()}</Link>
        </div>
      )}
    </div>
  );
}

export default function EntityEditPage({
  type, id, schema, editFields, entityLabel, routeBase, footer,
}: EntityEditPageProps) {
  const { yaml, path, loading: yamlLoading, error: yamlError, refetch } = useEntityYaml(type, id);
  const { saving, error: saveError, success: saveSuccess, save, migrate, reset: resetSave } = useEntityYamlSave();

  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  const [migrated, setMigrated] = useState(false);

  const handleDraftChange = useCallback((next: Record<string, unknown>) => {
    setDraft(next);
    resetSave();
    setMigrated(false);
  }, [resetSave]);

  useEffect(() => {
    if (yaml && (draft === null || (yaml as any).id !== draft.id)) {
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
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      const issues = parsed.error?.issues ?? [];
      setValidationErrors(issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
      return;
    }
    setValidationErrors(null);
    if (!path) {
      setValidationErrors(['(root): missing content file path; cannot save']);
      return;
    }
    const ok = await save(path, draft);
    if (ok) {
      setMigrated(false);
    }
  }, [draft, path, save, schema]);

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
        <Link href={`/${routeBase}/${id}`} className={styles.backLink}>&larr; Back to {entityLabel}</Link>
        <p className={styles.muted}>Loading...</p>
      </main>
    );
  }

  if (yamlError || !yaml) {
    return (
      <main className={styles.main}>
        <Link href={`/${routeBase}/${id}`} className={styles.backLink}>&larr; Back to {entityLabel}</Link>
        <div className={styles.errorBox}>{yamlError || 'Not found'}</div>
      </main>
    );
  }

  const yamlRecord = yaml as Record<string, unknown>;
  const displayTitle = draft ? String(draft.name ?? yamlRecord.name ?? id) : String(yamlRecord.name ?? id);

  return (
    <main className={styles.main}>
      <Link href={`/${routeBase}/${id}`} className={styles.backLink}>&larr; Back to {entityLabel}</Link>
      <h1>Edit {entityLabel}: {displayTitle}</h1>
      {validationErrors && (
        <div className={styles.validationErrors}>
          <strong>Validation failed:</strong>
          <ul>
            {validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
        </div>
      )}
      {saveError && <div className={styles.errorBox}>{saveError}</div>}
      {(saveSuccess || migrated) && (
        <SaveSuccess entityLabel={entityLabel} routeBase={routeBase} id={id} migrated={migrated} onMigrate={handleMigrate} saving={saving} />
      )}
      {draft && (
        <EntityEditForm
          fields={editFields}
          yaml={draft}
          onChange={handleDraftChange}
          onSubmit={handleSave}
          submitting={saving}
        />
      )}
      {footer}
    </main>
  );
}