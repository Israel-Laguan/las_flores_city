'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { YAMLDialogueSchema } from '@las-flores/shared';
import { useEntityYaml } from '@/components/entity/useEntityYaml';
import { useEntityYamlSave } from '@/components/entity/useEntityYamlSave';
import DialogueVisualEditor from '@/components/dialogue/DialogueVisualEditor';
import styles from './dialogue-detail.module.css';

export default function DialogueDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { yaml, path, loading, error } = useEntityYaml<Record<string, unknown>>('dialogue', id);
  const { saving, error: saveError, success: saveSuccess, save, reset: resetSave } = useEntityYamlSave();

  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  // Tracks whether the in-memory draft differs from the last loaded/saved YAML
  // so we can warn before an unsaved edit is discarded (in-app nav / reload).
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!yaml) return;
    setDraft((prev) => (prev === null || prev.id !== yaml.id ? (yaml as Record<string, unknown>) : prev));
    setDirty(false);
  }, [yaml]);

  useEffect(() => {
    if (saveSuccess) {
      setValidationErrors(null);
      setDirty(false);
    }
  }, [saveSuccess]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleDraftChange = (next: Record<string, unknown>) => {
    setDraft(next);
    setDirty(true);
    resetSave();
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!path) {
      setValidationErrors(['(root): missing content file path; cannot save']);
      return;
    }
    const parsed = YAMLDialogueSchema.safeParse(draft);
    if (!parsed.success) {
      const issues = parsed.error?.issues ?? [];
      const messages = issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
      setValidationErrors(
        messages.length > 0 ? messages : ['(root): the dialogue does not match the schema']
      );
      return;
    }
    setValidationErrors(null);
    await save(path, draft);
  };

  return (
    <main className={styles.main}>
      <Link
        href="/dialogues"
        className={styles.backLink}
        onClick={(e) => {
          if (dirty && !window.confirm('You have unsaved changes. Leave anyway?')) {
            e.preventDefault();
          }
        }}
      >&larr; Back to Dialogues</Link>
      <h1>Dialogue: {typeof draft?.name === 'string' ? draft.name : id}</h1>

      {loading && <p className={styles.muted}>Loading...</p>}
      {!loading && error && (
        <div className={styles.errorBox}>
          {error === 'Not found' ? 'Not found.' : error}{' '}
          <Link href="/editor" className={styles.editorLink}>Open raw editor</Link>
        </div>
      )}
      {!loading && !error && validationErrors && (
        <div className={styles.validationBox}>
          <strong>Validation failed:</strong>
          <ul>
            {validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
        </div>
      )}
      {!loading && !error && saveError && <div className={styles.errorBox}>{saveError}</div>}
      {!loading && !error && saveSuccess && (
        <div className={styles.successBox}>
          Saved to YAML. Run the migration (Content → Migrate) to sync the DB.
        </div>
      )}

      {!loading && !error && draft && (
        <section className={styles.editorSection}>
          <DialogueVisualEditor record={draft} onChange={handleDraftChange} />
          <div className={styles.actions}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn--primary"
            >
              {saving ? 'Saving...' : 'Save Visuals'}
            </button>
            {path && <span className={styles.pathHint}>Saving to: {path}</span>}
          </div>
        </section>
      )}

      {!loading && !error && draft && (
        <details className={styles.jsonDetails}>
          <summary>Raw YAML/JSON</summary>
          <pre className={styles.json}>{JSON.stringify(draft, null, 2)}</pre>
        </details>
      )}
    </main>
  );
}
