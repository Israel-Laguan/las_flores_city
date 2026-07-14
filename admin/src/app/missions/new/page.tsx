'use client';

import { cn } from '@/lib/cn';
import styles from './mission-wizard.module.css';
import MissionResultView from './components/MissionResultView';
import { useMissionWizard } from './hooks/useMissionWizard';

function StepMission({ title, setTitle, description, setDescription, status, setStatus, loreRef, setLoreRef }: any) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 1: Define Mission</h2>
      <div className={styles.field}>
        <label className={styles.label}>Title *</label>
        <input className={styles.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="The Great Lithium Leak" />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Description</label>
        <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} placeholder="Decades after the lithium spill..." />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Status</label>
        <select className={styles.select} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="RESOLVING">RESOLVING</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>Lore Reference</label>
        <input className={styles.input} value={loreRef} onChange={e => setLoreRef(e.target.value)} placeholder="stories/the_great_lithium_leak.md" />
      </div>
    </div>
  );
}

function CheckboxList({ heading, items, selected, onToggle, labelKey }: any) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>{heading}</h2>
      {items.length === 0 ? <p className={styles.muted}>Loading...</p> : (
        <div className={styles.checkboxScroll}>
          {items.map((item: any) => (
            <label key={item.id} className={styles.checkboxLabel}>
              <input type="checkbox" className={styles.checkbox} checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
              {item[labelKey] || item.id}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function StepContent({ vaultItems, setVaultItems, overlays, setOverlays }: any) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 5: Add Content</h2>
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>Vault Items ({vaultItems.length})</h3>
        {vaultItems.map((v: any, i: number) => (
          <div key={i} className={styles.addRow}>
            <input className={cn(styles.miniInput, styles.flex1)} value={v.title} onChange={e => {
              const next = [...vaultItems]; next[i] = { ...next[i], title: e.target.value }; setVaultItems(next);
            }} placeholder="Title" />
            <select className={styles.miniInput} value={v.item_type} onChange={e => {
              const next = [...vaultItems]; next[i] = { ...next[i], item_type: e.target.value as any }; setVaultItems(next);
            }}>
              <option value="clue">Clue</option>
              <option value="memento">Memento</option>
              <option value="premium_cg">Premium CG</option>
            </select>
            <button className={cn(styles.button, styles.dangerButton, styles.smallButton)} onClick={() => setVaultItems(vaultItems.filter((_: any, j: number) => j !== i))}>&times;</button>
          </div>
        ))}
        <div className={styles.addRow}>
          <button className={cn(styles.button, styles.secondaryButton)} onClick={() => setVaultItems([...vaultItems, { title: '', description: '', item_type: 'clue' }])}>+ Add Vault Item</button>
        </div>
      </div>
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>Overlays ({overlays.length})</h3>
        {overlays.map((_o: any, i: number) => (
          <div key={i} className={styles.addRow}>
            <input className={cn(styles.miniInput, styles.flex1)} value={overlays[i].name} onChange={e => {
              const next = [...overlays]; next[i] = { ...next[i], name: e.target.value }; setOverlays(next);
            }} placeholder="Overlay name" />
            <input className={cn(styles.miniInput, styles.flex1)} value={overlays[i].target_tree_id} onChange={e => {
              const next = [...overlays]; next[i] = { ...next[i], target_tree_id: e.target.value }; setOverlays(next);
            }} placeholder="Target dialogue tree UUID" />
            <button className={cn(styles.button, styles.dangerButton, styles.smallButton)} onClick={() => setOverlays(overlays.filter((_: any, j: number) => j !== i))}>&times;</button>
          </div>
        ))}
        <div className={styles.addRow}>
          <button className={cn(styles.button, styles.secondaryButton)} onClick={() => setOverlays([...overlays, { name: '', target_tree_id: '' }])}>+ Add Overlay</button>
        </div>
      </div>
    </div>
  );
}

function StepStory({ createStory, setCreateStory, storyTitle, setStoryTitle, storyDescription, setStoryDescription, storyLoreRef, setStoryLoreRef, title, selectedCharacters, selectedScenes, selectedDialogues, overlays, vaultItems }: any) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 6: Package as Story</h2>
      <label className={styles.checkboxLabel}>
        <input type="checkbox" className={styles.checkbox} checked={createStory} onChange={e => setCreateStory(e.target.checked)} />
        Create a story package
      </label>
      {createStory && (
        <div className={styles.storyForm}>
          <div className={styles.field}>
            <label className={styles.label}>Story Title</label>
            <input className={styles.input} value={storyTitle} onChange={e => setStoryTitle(e.target.value)} placeholder={title ? `${title} — Complete Package` : 'Story title'} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Story Description</label>
            <textarea className={styles.textarea} value={storyDescription} onChange={e => setStoryDescription(e.target.value)} placeholder="Complete mission package..." />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Story Lore Reference</label>
            <input className={styles.input} value={storyLoreRef} onChange={e => setStoryLoreRef(e.target.value)} placeholder="stories/my_story.md" />
          </div>
          <div className={styles.subsection}>
            <h3 className={styles.subsectionTitle}>Story Package Summary</h3>
            <p className={styles.summaryText}>
              This story will link to: mission "{title || '(untitled)'}", {selectedCharacters.size} characters, {selectedScenes.size} scenes, {selectedDialogues.size} dialogues, {overlays.length} overlays, {vaultItems.length} vault items.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function WizardProgressBar({ step, stepLabels }: { step: number; stepLabels: string[] }) {
  return (
    <div className={styles.progressBar}>
      {stepLabels.map((label, i) => (
        <div key={i} className={styles.progressStep}>
          <div className={cn(styles.stepDot, i + 1 === step ? styles.stepActive : i + 1 < step ? styles.stepDone : styles.stepPending)}>
            {i + 1 < step ? '✓' : i + 1}
          </div>
          <span className={cn(styles.stepLabel, i + 1 === step && styles.stepLabelActive)}>{label}</span>
          {i < stepLabels.length - 1 && <div className={styles.stepLine} />}
        </div>
      ))}
    </div>
  );
}

function WizardNav({ step, totalSteps, onPrev, onNext, generating }: { step: number; totalSteps: number; onPrev: () => void; onNext: () => void; generating: boolean }) {
  return (
    <div className={styles.navBar}>
      {step > 1 && <button className={styles.secondaryButton} onClick={onPrev}>&larr; Back</button>}
      {step < totalSteps ? (
        <button className={styles.primaryButton} onClick={onNext}>Next &rarr;</button>
      ) : (
        <button className={cn(styles.primaryButton, styles.largeButton)} onClick={onNext} disabled={generating}>
          {generating ? 'Generating...' : 'Generate Mission'}
        </button>
      )}
    </div>
  );
}

const stepLabels = ['Mission', 'Characters', 'Scenes', 'Dialogues', 'Content', 'Story'];

export default function MissionWizardPage() {
  const wizard = useMissionWizard();

  if (wizard.generated) {
    return <MissionResultView title={wizard.title} generatedLinks={wizard.generatedLinks} onReset={wizard.reset} />;
  }

  return (
    <main className={styles.main}>
      <h1>Mission Wizard</h1>
      <WizardProgressBar step={wizard.step} stepLabels={stepLabels} />

      {wizard.error && <div className={styles.errorBox}>{wizard.error}</div>}

      {wizard.step === 1 && <StepMission title={wizard.title} setTitle={wizard.setTitle} description={wizard.description} setDescription={wizard.setDescription} status={wizard.status} setStatus={wizard.setStatus} loreRef={wizard.loreRef} setLoreRef={wizard.setLoreRef} />}
      {wizard.step === 2 && <CheckboxList heading={`Step 2: Add Characters (${wizard.selectedCharacters.size} selected)`} items={wizard.allCharacters} selected={wizard.selectedCharacters} onToggle={wizard.toggleCharacter} labelKey="name" />}
      {wizard.step === 3 && <CheckboxList heading={`Step 3: Add Scenes (${wizard.selectedScenes.size} selected)`} items={wizard.allScenes} selected={wizard.selectedScenes} onToggle={wizard.toggleScene} labelKey="name" />}
      {wizard.step === 4 && <CheckboxList heading={`Step 4: Add Dialogues (${wizard.selectedDialogues.size} selected)`} items={wizard.allDialogues} selected={wizard.selectedDialogues} onToggle={wizard.toggleDialogue} labelKey="name" />}
      {wizard.step === 5 && <StepContent vaultItems={wizard.vaultItems} setVaultItems={wizard.setVaultItems} overlays={wizard.overlays} setOverlays={wizard.setOverlays} />}
      {wizard.step === 6 && <StepStory createStory={wizard.createStory} setCreateStory={wizard.setCreateStory} storyTitle={wizard.storyTitle} setStoryTitle={wizard.setStoryTitle} storyDescription={wizard.storyDescription} setStoryDescription={wizard.setStoryDescription} storyLoreRef={wizard.storyLoreRef} setStoryLoreRef={wizard.setStoryLoreRef} title={wizard.title} selectedCharacters={wizard.selectedCharacters} selectedScenes={wizard.selectedScenes} selectedDialogues={wizard.selectedDialogues} overlays={wizard.overlays} vaultItems={wizard.vaultItems} />}

      <WizardNav step={wizard.step} totalSteps={6} onPrev={() => wizard.setStep(wizard.step - 1)} onNext={wizard.step < 6 ? () => wizard.setStep(wizard.step + 1) : wizard.handleGenerate} generating={wizard.generating} />
    </main>
  );
}