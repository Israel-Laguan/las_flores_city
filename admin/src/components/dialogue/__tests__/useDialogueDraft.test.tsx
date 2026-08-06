import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mutable mock backing for the entity hooks so each test can simulate the
// loading/yaml emissions the parent page would drive (including id changes).
const entityMock: {
  yaml: Record<string, unknown> | null;
  path: string | null;
  loading: boolean;
  error: string | null;
} = {
  yaml: null,
  path: null,
  loading: true,
  error: null,
};

vi.mock('@/components/entity/useEntityYaml', () => ({
  useEntityYaml: () => ({
    yaml: entityMock.yaml,
    path: entityMock.path,
    loading: entityMock.loading,
    error: entityMock.error,
    refetch: vi.fn(),
  }),
}));

const resetSave = vi.fn();
vi.mock('@/components/entity/useEntityYamlSave', () => ({
  useEntityYamlSave: () => ({
    saving: false,
    error: null,
    success: false,
    save: vi.fn(),
    migrate: vi.fn(),
    reset: resetSave,
  }),
}));

import { useDialogueDraft } from '../useDialogueDraft';

describe('useDialogueDraft', () => {
  beforeEach(() => {
    entityMock.yaml = null;
    entityMock.path = null;
    entityMock.loading = true;
    entityMock.error = null;
    resetSave.mockClear();
  });

  it('resets the draft, dirty flag, and save state when the id changes', () => {
    entityMock.yaml = { id: '1', name: 'Dialogue 1' };
    entityMock.path = 'dialogues/1/story.yaml';
    entityMock.loading = false;

    const { result, rerender } = renderHook(
      ({ id }) => useDialogueDraft(id),
      { initialProps: { id: '1' } },
    );

    expect(result.current.draft?.id).toBe('1');
    expect(result.current.path).toBe('dialogues/1/story.yaml');

    // User edits the draft.
    act(() => {
      result.current.onDraftChange({ id: '1', name: 'Edited 1' });
    });
    expect(result.current.dirty).toBe(true);

    // Navigate to /dialogues/2: draft, path, and save state must reset so the
    // previous dialogue can never render (or be saved) under the new URL.
    entityMock.yaml = null;
    entityMock.path = null;
    entityMock.loading = true;
    rerender({ id: '2' });

    expect(result.current.draft).toBeNull();
    expect(result.current.path).toBeNull();
    expect(result.current.dirty).toBe(false);
    expect(resetSave).toHaveBeenCalled();
  });

  it('loads the new dialogue after an id change', () => {
    // Mount with dialogue 1.
    entityMock.yaml = { id: '1', name: 'Dialogue 1' };
    entityMock.path = 'dialogues/1/story.yaml';
    entityMock.loading = false;

    const { result, rerender } = renderHook(
      ({ id }) => useDialogueDraft(id),
      { initialProps: { id: '1' } },
    );

    expect(result.current.draft?.id).toBe('1');

    // Switch the mock to dialogue 2 and rerender with id '2' to exercise the
    // post-navigation load path.
    entityMock.yaml = { id: '2', name: 'Dialogue 2' };
    entityMock.path = 'dialogues/2/story.yaml';
    entityMock.loading = false;
    rerender({ id: '2' });

    expect(result.current.draft?.id).toBe('2');
    expect(result.current.dirty).toBe(false);
  });
});
