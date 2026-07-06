"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ListItem { id: string; name?: string; title?: string; [key: string]: unknown; }

interface VaultItemDraft {
  title: string;
  description: string;
  item_type: 'clue' | 'memento' | 'premium_cg';
}

interface OverlayDraft {
  name: string;
  target_tree_id: string;
}

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  progressBar: { display: 'flex', gap: '0.5rem', marginBottom: '2rem', alignItems: 'center' },
  stepDot: { width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 'bold' as const },
  stepActive: { backgroundColor: '#00ff00', color: '#000' },
  stepDone: { backgroundColor: '#00ff0044', color: '#00ff00', border: '1px solid #00ff00' },
  stepPending: { backgroundColor: '#333', color: '#888' },
  stepLine: { flex: 1, height: '2px', backgroundColor: '#333' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  field: { marginBottom: '1rem' },
  label: { display: 'block', color: '#888', fontSize: '0.85rem', marginBottom: '0.25rem' },
  input: {
    width: '100%', padding: '0.5rem', backgroundColor: '#0d0d1a', color: '#00ff00',
    border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9rem', boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%', padding: '0.5rem', backgroundColor: '#0d0d1a', color: '#00ff00',
    border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9rem',
    minHeight: '80px', resize: 'vertical' as const, boxSizing: 'border-box' as const,
  },
  select: {
    padding: '0.5rem', backgroundColor: '#0d0d1a', color: '#00ff00',
    border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9rem',
  },
  checkbox: { marginRight: '0.5rem' },
  checkboxLabel: { display: 'flex', alignItems: 'center', padding: '0.4rem 0', cursor: 'pointer', fontSize: '0.9rem' },
  button: {
    padding: '0.75rem 1.5rem', borderRadius: '5px', fontWeight: 'bold' as const, fontFamily: 'monospace',
    cursor: 'pointer', border: 'none', fontSize: '0.9rem',
  },
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
  secondaryButton: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  dangerButton: { backgroundColor: '#ff4444', color: '#fff' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' as const },
  navBar: { display: 'flex', gap: '1rem', marginTop: '1.5rem' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '0.75rem', borderRadius: '5px', marginBottom: '1rem' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '1rem', borderRadius: '5px', marginBottom: '1rem' },
  muted: { color: '#888' },
  subsection: { padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px', marginBottom: '1rem' },
  miniInput: {
    padding: '0.4rem', backgroundColor: '#1a1a2e', color: '#00ff00',
    border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.85rem',
  },
  addRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' },
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// --- Step sub-components ----------------------------------------------------

function StepMission({ title, setTitle, description, setDescription, status, setStatus, loreRef, setLoreRef, styles }: any) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>Step 1: Define Mission</h2>
      <div style={styles.field}>
        <label style={styles.label}>Title *</label>
        <input style={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="The Great Lithium Leak" />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Description</label>
        <textarea style={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} placeholder="Decades after the lithium spill..." />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Status</label>
        <select style={styles.select} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="RESOLVING">RESOLVING</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Lore Reference</label>
        <input style={styles.input} value={loreRef} onChange={e => setLoreRef(e.target.value)} placeholder="stories/the_great_lithium_leak.md" />
      </div>
    </div>
  );
}

function CheckboxList({ heading, items, selected, onToggle, labelKey, styles }: any) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>{heading}</h2>
      {items.length === 0 ? <p style={styles.muted}>Loading...</p> : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {items.map((item: any) => (
            <label key={item.id} style={styles.checkboxLabel}>
              <input type="checkbox" style={styles.checkbox} checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
              {item[labelKey] || item.id}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function StepContent({ vaultItems, setVaultItems, overlays, setOverlays, styles }: any) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>Step 5: Add Content</h2>
      <div style={styles.subsection}>
        <h3 style={{ color: '#00ff00', marginBottom: '0.75rem', fontSize: '0.9rem' }}>Vault Items ({vaultItems.length})</h3>
        {vaultItems.map((v: any, i: number) => (
          <div key={i} style={{ ...styles.addRow, marginBottom: '0.5rem' }}>
            <input style={{ ...styles.miniInput, flex: 1 }} value={v.title} onChange={e => {
              const next = [...vaultItems]; next[i] = { ...next[i], title: e.target.value }; setVaultItems(next);
            }} placeholder="Title" />
            <select style={styles.miniInput} value={v.item_type} onChange={e => {
              const next = [...vaultItems]; next[i] = { ...next[i], item_type: e.target.value as any }; setVaultItems(next);
            }}>
              <option value="clue">Clue</option>
              <option value="memento">Memento</option>
              <option value="premium_cg">Premium CG</option>
            </select>
            <button style={{ ...styles.button, ...styles.dangerButton, fontSize: '0.7rem', padding: '0.3rem 0.5rem' }} onClick={() => setVaultItems(vaultItems.filter((_: any, j: number) => j !== i))}>✕</button>
          </div>
        ))}
        <div style={styles.addRow}>
          <button style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.8rem' }} onClick={() => setVaultItems([...vaultItems, { title: '', description: '', item_type: 'clue' }])}>+ Add Vault Item</button>
        </div>
      </div>
      <div style={styles.subsection}>
        <h3 style={{ color: '#00ff00', marginBottom: '0.75rem', fontSize: '0.9rem' }}>Overlays ({overlays.length})</h3>
        {overlays.map((_o: any, i: number) => (
          <div key={i} style={{ ...styles.addRow, marginBottom: '0.5rem' }}>
            <input style={{ ...styles.miniInput, flex: 1 }} value={overlays[i].name} onChange={e => {
              const next = [...overlays]; next[i] = { ...next[i], name: e.target.value }; setOverlays(next);
            }} placeholder="Overlay name" />
            <input style={{ ...styles.miniInput, flex: 1 }} value={overlays[i].target_tree_id} onChange={e => {
              const next = [...overlays]; next[i] = { ...next[i], target_tree_id: e.target.value }; setOverlays(next);
            }} placeholder="Target dialogue tree UUID" />
            <button style={{ ...styles.button, ...styles.dangerButton, fontSize: '0.7rem', padding: '0.3rem 0.5rem' }} onClick={() => setOverlays(overlays.filter((_: any, j: number) => j !== i))}>✕</button>
          </div>
        ))}
        <div style={styles.addRow}>
          <button style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.8rem' }} onClick={() => setOverlays([...overlays, { name: '', target_tree_id: '' }])}>+ Add Overlay</button>
        </div>
      </div>
    </div>
  );
}

function StepStory({ createStory, setCreateStory, storyTitle, setStoryTitle, storyDescription, setStoryDescription, storyLoreRef, setStoryLoreRef, title, selectedCharacters, selectedScenes, selectedDialogues, overlays, vaultItems, styles }: any) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>Step 6: Package as Story</h2>
      <label style={styles.checkboxLabel}>
        <input type="checkbox" style={styles.checkbox} checked={createStory} onChange={e => setCreateStory(e.target.checked)} />
        Create a story package
      </label>
      {createStory && (
        <div style={{ marginTop: '1rem' }}>
          <div style={styles.field}>
            <label style={styles.label}>Story Title</label>
            <input style={styles.input} value={storyTitle} onChange={e => setStoryTitle(e.target.value)} placeholder={title ? `${title} — Complete Package` : 'Story title'} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Story Description</label>
            <textarea style={styles.textarea} value={storyDescription} onChange={e => setStoryDescription(e.target.value)} placeholder="Complete mission package..." />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Story Lore Reference</label>
            <input style={styles.input} value={storyLoreRef} onChange={e => setStoryLoreRef(e.target.value)} placeholder="stories/my_story.md" />
          </div>
          <div style={styles.subsection}>
            <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Story Package Summary</h3>
            <p style={{ fontSize: '0.85rem', color: '#aaa' }}>
              This story will link to: mission &quot;{title || '(untitled)'}&quot;, {selectedCharacters.size} characters, {selectedScenes.size} scenes, {selectedDialogues.size} dialogues, {overlays.length} overlays, {vaultItems.length} vault items.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
export default function MissionWizardPage() {
  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<string[]>([]);

  // Step 1: Mission
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [loreRef, setLoreRef] = useState('');

  // Step 2-4: Selections
  const [allCharacters, setAllCharacters] = useState<ListItem[]>([]);
  const [allScenes, setAllScenes] = useState<ListItem[]>([]);
  const [allDialogues, setAllDialogues] = useState<ListItem[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(new Set());
  const [selectedDialogues, setSelectedDialogues] = useState<Set<string>>(new Set());

  // Step 5: Vault + Overlays
  const [vaultItems, setVaultItems] = useState<VaultItemDraft[]>([]);
  const [overlays, setOverlays] = useState<OverlayDraft[]>([]);

  // Step 6: Story
  const [createStory, setCreateStory] = useState(true);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyDescription, setStoryDescription] = useState('');
  const [storyLoreRef, setStoryLoreRef] = useState('');

  // Load available items
  useEffect(() => {
    const endpoints = [
      { url: '/api/admin/characters', setter: setAllCharacters },
      { url: '/api/admin/scenes', setter: setAllScenes },
      { url: '/api/admin/dialogues', setter: setAllDialogues },
    ];
    for (const { url, setter } of endpoints) {
      fetch(url).then(r => r.json()).then(d => {
        if (d.success) setter(d.data.items || []);
      }).catch(() => {});
    }
  }, []);

  const toggleSet = (s: Set<string>, setS: (v: Set<string>) => void, id: string) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    setS(next);
  };

  const missionId = generateUUID();
  const slug = slugify(title);

  const handleGenerate = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setGenerating(true);
    setError(null);
    const links: string[] = [];

    try {
      // 1. Create mission YAML
      const missionYaml = `missions:\n  - id: "${missionId}"\n    title: "${title}"\n    description: "${description.replace(/"/g, '\\"')}"\n    status: "${status}"\n${loreRef ? `    lore_ref: "${loreRef}"\n` : ''}`;
      const missionPath = `missions/mission_${slug}.yaml`;
      await writeYaml(missionPath, missionYaml);
      links.push(missionPath);

      // 2. Create story YAML (if enabled)
      if (createStory) {
        const storyId = generateUUID();
        const storyYaml = `stories:\n  - id: "${storyId}"\n    title: "${storyTitle || title}"\n    description: "${(storyDescription || description).replace(/"/g, '\\"')}"\n    mission_id: "${missionId}"\n    characters: [${[...selectedCharacters].map(id => `"${id}"`).join(', ')}]\n    scenes: [${[...selectedScenes].map(id => `"${id}"`).join(', ')}]\n    dialogues: [${[...selectedDialogues].map(id => `"${id}"`).join(', ')}]\n    overlays: [${overlays.map(() => `"${generateUUID()}"`).join(', ')}]\n    vault_items: [${vaultItems.map(() => `"${generateUUID()}"`).join(', ')}]\n${storyLoreRef ? `    lore_ref: "${storyLoreRef}"\n` : ''}`;
        const storyPath = `stories/story_${slug}.yaml`;
        await writeYaml(storyPath, storyYaml);
        links.push(storyPath);
      }

      setGeneratedLinks(links);
      setGenerated(true);
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const writeYaml = async (filePath: string, content: string) => {
    const res = await fetch('/api/admin/content/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || `Failed to write ${filePath}`);
  };

  const renderStep = () => {
    switch (step) {
      case 1: return <StepMission title={title} setTitle={setTitle} description={description} setDescription={setDescription} status={status} setStatus={setStatus} loreRef={loreRef} setLoreRef={setLoreRef} styles={styles} />;
      case 2: return <CheckboxList heading={`Step 2: Add Characters (${selectedCharacters.size} selected)`} items={allCharacters} selected={selectedCharacters} onToggle={(id: string) => toggleSet(selectedCharacters, setSelectedCharacters, id)} labelKey="name" styles={styles} />;
      case 3: return <CheckboxList heading={`Step 3: Add Scenes (${selectedScenes.size} selected)`} items={allScenes} selected={selectedScenes} onToggle={(id: string) => toggleSet(selectedScenes, setSelectedScenes, id)} labelKey="name" styles={styles} />;
      case 4: return <CheckboxList heading={`Step 4: Add Dialogues (${selectedDialogues.size} selected)`} items={allDialogues} selected={selectedDialogues} onToggle={(id: string) => toggleSet(selectedDialogues, setSelectedDialogues, id)} labelKey="name" styles={styles} />;
      case 5: return <StepContent vaultItems={vaultItems} setVaultItems={setVaultItems} overlays={overlays} setOverlays={setOverlays} styles={styles} />;
      case 6: return <StepStory createStory={createStory} setCreateStory={setCreateStory} storyTitle={storyTitle} setStoryTitle={setStoryTitle} storyDescription={storyDescription} setStoryDescription={setStoryDescription} storyLoreRef={storyLoreRef} setStoryLoreRef={setStoryLoreRef} title={title} selectedCharacters={selectedCharacters} selectedScenes={selectedScenes} selectedDialogues={selectedDialogues} overlays={overlays} vaultItems={vaultItems} styles={styles} />;
      default: return null;
    }
  };

  const stepLabels = ['Mission', 'Characters', 'Scenes', 'Dialogues', 'Content', 'Story'];

  if (generated) {
    return (
      <main style={styles.main}>
        <h1 style={styles.heading}>✅ Mission Generated</h1>
        <div style={styles.successBox}>
          <p style={{ marginBottom: '0.5rem' }}>Mission &quot;{title}&quot; created successfully!</p>
          <p style={{ fontSize: '0.85rem', color: '#aaa' }}>Files created:</p>
          <ul style={{ fontSize: '0.85rem', color: '#aaa', paddingLeft: '1.5rem' }}>
            {generatedLinks.map(l => <li key={l}>{l}</li>)}
          </ul>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <Link href="/missions" style={{ ...styles.button, ...styles.primaryButton, textDecoration: 'none' }}>View Missions</Link>
          <Link href="/stories" style={{ ...styles.button, ...styles.secondaryButton, textDecoration: 'none' }}>View Stories</Link>
          <Link href="/editor" style={{ ...styles.button, ...styles.secondaryButton, textDecoration: 'none' }}>Edit in YAML Editor</Link>
          <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => { setGenerated(false); setStep(1); setTitle(''); setDescription(''); setLoreRef(''); setSelectedCharacters(new Set()); setSelectedScenes(new Set()); setSelectedDialogues(new Set()); setVaultItems([]); setOverlays([]); setCreateStory(true); }}>Create Another</button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>🚀 Mission Wizard</h1>

      {/* Progress bar */}
      <div style={styles.progressBar}>
        {stepLabels.map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              ...styles.stepDot,
              ...(i + 1 === step ? styles.stepActive : i + 1 < step ? styles.stepDone : styles.stepPending),
            }}>
              {i + 1 < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: '0.75rem', color: i + 1 === step ? '#00ff00' : '#888' }}>{label}</span>
            {i < stepLabels.length - 1 && <div style={styles.stepLine} />}
          </div>
        ))}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {renderStep()}

      {/* Navigation */}
      <div style={styles.navBar}>
        {step > 1 && (
          <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => setStep(step - 1)}>← Back</button>
        )}
        {step < 6 ? (
          <button style={{ ...styles.button, ...styles.primaryButton }} onClick={() => setStep(step + 1)}>Next →</button>
        ) : (
          <button
            style={{ ...styles.button, ...styles.primaryButton, fontSize: '1rem' }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '⏳ Generating...' : '🚀 Generate Mission'}
          </button>
        )}
      </div>
    </main>
  );
}
