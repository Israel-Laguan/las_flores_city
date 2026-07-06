"use client";

import { useState } from 'react';
import { adminStyles as styles } from '@/lib/adminStyles';
import BeatForm from './components/BeatForm';
import BeatTable from './components/BeatTable';
import { useBeatHandlers } from './hooks/useBeatHandlers';

export default function StoryBeatsPage() {
  const h = useBeatHandlers();
  const [formSlug, setFormSlug] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formOrder, setFormOrder] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const resetForm = () => { setFormSlug(''); setFormLabel(''); setFormOrder(''); setFormDescription(''); };
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    h.handleAddSubmit({ slug: formSlug, label: formLabel, order: formOrder, description: formDescription }, resetForm);
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>📖 Beat Registry</h1>
      <BeatForm formSlug={formSlug} formLabel={formLabel} formOrder={formOrder} formDescription={formDescription} submitting={h.submitting} onSlugChange={setFormSlug} onLabelChange={setFormLabel} onOrderChange={setFormOrder} onDescriptionChange={setFormDescription} onSubmit={handleAddSubmit} />
      {h.error && <div style={styles.errorBox}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{h.error}</pre></div>}
      <BeatTable beats={h.beats} loading={h.loading} editingSlug={h.editingSlug} editState={h.editState} submitting={h.submitting} onEditStart={h.handleEditStart} onEditSave={h.handleEditSave} onEditCancel={() => h.setEditingSlug(null)} onEditStateChange={h.setEditState} onDelete={h.handleDelete} />
    </main>
  );
}
