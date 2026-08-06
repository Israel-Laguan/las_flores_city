'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import DialogueVisualEditor from '@/components/dialogue/DialogueVisualEditor';
import { useDialogueDraft } from '@/components/dialogue/useDialogueDraft';
import { useUnsafeNavigationGuard } from '@/hooks/useUnsafeNavigationGuard';
import styles from './dialogue-detail.module.css';

export default function DialogueDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const {
    draft,
    path,
    loading,
    error,
    saving,
    saveError,
    saveSuccess,
    validationErrors,
    dirty,
    onDraftChange,
    onSave,
  } = useDialogueDraft(id);

  // Warn before losing unsaved edits across ANY navigation (sidebar, breadcrumbs,
  // back link, browser back, reload, logout) — see hook for the full coverage.
  useUnsafeNavigationGuard(dirty);

  const ready = !loading && !error;

  return (
    <main className={styles.main}>
      {/* Unsaved-edit confirmation for this back link is handled by the shared
          useUnsafeNavigationGuard hook (see above). */}
      <Link href="/dialogues" className={styles.backLink}>&larr; Back to Dialogues</Link>
      <h1>Dialogue: {typeof draft?.name === 'string' ? draft.name : id}</h1>

      {loading && <p className={styles.muted}>Loading...</p>}
      {!loading && error && (
        <div className={styles.errorBox}>
          {error === 'Not found' ? 'Not found.' : error}{' '}
          <Link href="/editor" className={styles.editorLink}>Open raw editor</Link>
        </div>
      )}
      {ready && validationErrors && (
        <div className={styles.validationBox}>
          <strong>Validation failed:</strong>
          <ul>
            {validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}
          </ul>
        </div>
      )}
      {ready && saveError && <div className={styles.errorBox}>{saveError}</div>}
      {ready && saveSuccess && !dirty && (
        <div className={styles.successBox}>
          Saved to YAML. Run the migration (Content → Migrate) to sync the DB.
        </div>
      )}

      {ready && draft && (
        <section className={styles.editorSection}>
          <DialogueVisualEditor record={draft} onChange={onDraftChange} />
          <div className={styles.actions}>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="btn btn--primary"
            >
              {saving ? 'Saving...' : 'Save Visuals'}
            </button>
            {path && <span className={styles.pathHint}>Saving to: {path}</span>}
            <span className={styles.pathHint}>
              Note: saving rewrites the YAML from this form; authored comments/formatting in the file are normalized on save.
            </span>
          </div>
        </section>
      )}

      {ready && draft && (
        <details className={styles.jsonDetails}>
          <summary>Raw YAML/JSON</summary>
          <pre className={styles.json}>{JSON.stringify(draft, null, 2)}</pre>
        </details>
      )}
    </main>
  );
}
