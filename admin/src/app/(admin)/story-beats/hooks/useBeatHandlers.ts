import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/client-api';

interface StoryBeat { slug: string; label: string; order: number; description: string }
interface EditState { label: string; order: string; description: string }

export function useBeatHandlers() {
  const [beats, setBeats] = useState<StoryBeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ label: '', order: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchBeats = useCallback(async () => {
    try {
      const data = await adminFetch<{ success: boolean; data?: StoryBeat[]; error?: string }>(
        '/admin/story-beats',
      );
      if (data.success) { setBeats(data.data ?? []); }
      else { setError(data.error || 'Failed to fetch beats'); }
    } catch { setError('Failed to fetch story beats'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBeats(); }, [fetchBeats]);

  const handleAddSubmit = async (form: { slug: string; label: string; order: string; description: string }, resetForm: () => void) => {
    setSubmitting(true); setError(null);
    try {
      const data = await adminFetch<{ success: boolean; error?: string }>(
        '/admin/story-beats',
        {
          method: 'POST',
          body: JSON.stringify({ slug: form.slug, label: form.label, order: Number(form.order), description: form.description }),
        },
      );
      if (data.success) { resetForm(); await fetchBeats(); } else { setError(data.error || 'Failed to create beat'); }
    } catch { setError('Failed to create beat'); } finally { setSubmitting(false); }
  };

  const handleEditStart = (beat: StoryBeat) => {
    setEditingSlug(beat.slug);
    setEditState({ label: beat.label ?? '', order: beat.order != null ? String(beat.order) : '', description: beat.description ?? '' });
  };

  const handleEditSave = async (slug: string) => {
    setSubmitting(true); setError(null);
    try {
      const data = await adminFetch<{ success: boolean; error?: string }>(
        `/admin/story-beats/${slug}`,
        {
          method: 'PUT',
          body: JSON.stringify({ label: editState.label, order: Number(editState.order), description: editState.description }),
        },
      );
      if (data.success) { setEditingSlug(null); await fetchBeats(); } else { setError(data.error || 'Failed to update beat'); }
    } catch { setError('Failed to update beat'); } finally { setSubmitting(false); }
  };

  const handleDelete = async (slug: string) => {
    if (!window.confirm(`Delete beat "${slug}"? This cannot be undone.`)) return;
    setSubmitting(true); setError(null);
    try {
      const data = await adminFetch<{ success: boolean; error?: string }>(
        `/admin/story-beats/${slug}`,
        { method: 'DELETE' },
      );
      if (data.success) { await fetchBeats(); } else { setError(data.error || 'Failed to delete beat'); }
    } catch { setError('Failed to delete beat'); } finally { setSubmitting(false); }
  };

  return { beats, loading, error, editingSlug, editState, submitting, fetchBeats, handleAddSubmit, handleEditStart, handleEditSave, handleDelete, setEditingSlug, setEditState };
}
