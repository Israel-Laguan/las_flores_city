'use client';

import { useEffect, useRef, useState } from 'react';
import { YAMLDialogueSchema } from '@las-flores/shared';
import { useEntityYaml } from '@/components/entity/useEntityYaml';
import { useEntityYamlSave } from '@/components/entity/useEntityYamlSave';

type DialogueRecord = Record<string, unknown>;

export interface DialogueDraft {
  draft: DialogueRecord | null;
  path: string | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  validationErrors: string[] | null;
  /** True while the in-memory draft differs from the last loaded/saved YAML. */
  dirty: boolean;
  onDraftChange: (next: DialogueRecord) => void;
  onSave: () => Promise<void>;
}

/**
 * Loads a dialogue's YAML, tracks the in-memory draft, and validates it against
 * `YAMLDialogueSchema` before saving.
 *
 * `dirty` is exposed so the page can guard navigations that would discard
 * unsaved edits (see `useUnsafeNavigationGuard`).
 */
export function useDialogueDraft(id: string): DialogueDraft {
  const { yaml, path, loading, error } = useEntityYaml<DialogueRecord>('dialogue', id);
  const { saving, error: saveError, success: saveSuccess, save, reset: resetSave } = useEntityYamlSave();

  const [draft, setDraft] = useState<DialogueRecord | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);
  const [dirty, setDirty] = useState(false);
  // Records when edits land while a PUT save is still in flight, so the
  // completion handler can re-arm dirty/success correctly for those edits.
  const dirtyDuringSaveRef = useRef(false);

  // Reset ALL editor state when the entity changes: the previous dialogue's
  // draft, path, and save flag must never render (or be saved) under a new
  // /dialogues/[id]. `useEntityYaml` also aborts/scopes its own in-flight
  // fetch to the current id, so the only `yaml` emission that can arrive here
  // after a reset belongs to the current id.
  useEffect(() => {
    setDraft(null);
    setValidationErrors(null);
    setDirty(false);
    resetSave();
  }, [id, resetSave]);

  useEffect(() => {
    if (!yaml) return;
    setDraft((prev) => (prev === null || prev.id !== yaml.id ? (yaml as DialogueRecord) : prev));
    setDirty(false);
  }, [yaml]);

  useEffect(() => {
    if (!saveSuccess) return;
    setValidationErrors(null);
    if (dirtyDuringSaveRef.current) {
      // Edits landed while the PUT was in flight; they are NOT part of the
      // YAML that was just written, so the page stays dirty.
      dirtyDuringSaveRef.current = false;
      setDirty(true);
    } else {
      setDirty(false);
    }
  }, [saveSuccess]);

  const onDraftChange = (next: DialogueRecord) => {
    setDraft(next);
    setDirty(true);
    if (saving) {
      // A PUT is still in flight: the Save button stays disabled so it cannot
      // start an overlapping write. Mark the draft so the completion handler
      // re-arms dirty/success correctly.
      dirtyDuringSaveRef.current = true;
    } else {
      resetSave();
    }
  };

  const onSave = async () => {
    if (!draft) return;
    if (!path) {
      setValidationErrors(['(root): missing content file path; cannot save']);
      return;
    }
    // Start a fresh save scope: any edit made while THIS PUT is in flight is
    // what dirtyDuringSaveRef should track. Resetting here means a successful
    // retry after a failed save is not wrongly marked dirty from the prior run.
    dirtyDuringSaveRef.current = false;
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

  return {
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
  };
}
