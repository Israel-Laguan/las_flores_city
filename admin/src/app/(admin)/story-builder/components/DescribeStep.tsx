'use client';

import { useState } from 'react';
import { cn } from '@las-flores/ui';
import styles from './DescribeStep.module.css';

const SOFT_CAP = 20_000;

function getLengthGuidance(len: number): string {
  if (len === 0) return '';
  if (len < 500) return 'Short and sweet works great — a sentence or two is enough for a focused plan.';
  if (len < 5_000) return 'Good length. The AI will extract entities and generate a structured plan.';
  if (len < 15_000) return 'Longer input supported. Generation may take a bit longer.';
  return 'Very long input. Consider breaking into smaller plans for faster results.';
}

interface DescribeStepProps {
  description: string;
  setDescription: (v: string) => void;
  onGenerate: () => void;
  loading: boolean;
  templates: Array<{ id: string; label: string; description: string; icon: string }>;
  onSelectTemplate: (id: string) => void;
  contentTree: Array<{ path: string; name: string; type: string }>;
  onClone: (sourcePath: string, newName: string) => void;
}

function CloneForm({
  grouped,
  loading,
  onClone,
}: {
  grouped: Record<string, DescribeStepProps['contentTree']>;
  loading: boolean;
  onClone: (sourcePath: string, newName: string) => void;
}) {
  const [cloneSource, setCloneSource] = useState('');
  const [cloneName, setCloneName] = useState('');

  return (
    <div className={styles.cloneForm}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="clone-source">Source Entity *</label>
        <select
          id="clone-source"
          className="select"
          value={cloneSource}
          onChange={e => setCloneSource(e.target.value)}
        >
          <option value="">Select an entity to clone...</option>
          {Object.entries(grouped).map(([type, entries]) => (
            <optgroup key={type} label={type}>
              {entries.map(e => (
                <option key={e.path} value={e.path}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="clone-name">New Name *</label>
        <input
          id="clone-name"
          className="input"
          type="text"
          value={cloneName}
          onChange={e => setCloneName(e.target.value)}
          placeholder="Enter a name for the cloned entity"
        />
      </div>
      <button
        className={cn(styles.button, styles.primaryButton, (loading || !cloneSource || !cloneName.trim()) && styles.disabledButton)}
        onClick={() => { if (cloneSource && cloneName.trim()) onClone(cloneSource, cloneName.trim()); }}
        disabled={loading || !cloneSource || !cloneName.trim()}
      >
        Clone
      </button>
    </div>
  );
}

function TemplatesSection({
  templates,
  loading,
  onSelectTemplate,
}: {
  templates: DescribeStepProps['templates'];
  loading: boolean;
  onSelectTemplate: (id: string) => void;
}) {
  if (templates.length === 0) return null;
  return (
    <div className={styles.subsection}>
      <h3 className={styles.templatesTitle}>Quick Start Templates</h3>
      <div className={styles.templatesGrid}>
        {templates.map(t => (
          <button
            key={t.id}
            className={cn(styles.templateButton, loading && styles.disabledButton)}
            disabled={loading}
            onClick={() => onSelectTemplate(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <p className={styles.templateHint}>
        Click a template to generate a pre-configured plan. You can still edit everything in Step 2.
      </p>
    </div>
  );
}

function CloneSection({
  contentTree,
  loading,
  onClone,
}: {
  contentTree: DescribeStepProps['contentTree'];
  loading: boolean;
  onClone: (sourcePath: string, newName: string) => void;
}) {
  const [showClone, setShowClone] = useState(false);
  const grouped = contentTree.reduce<Record<string, typeof contentTree>>((acc, entry) => {
    (acc[entry.type] ??= []).push(entry);
    return acc;
  }, {});

  if (contentTree.length === 0) return null;
  return (
    <div className={styles.subsection}>
      <div className={styles.cloneHeader}>
        <h3 className={styles.templatesTitle}>Clone Existing</h3>
        <button
          className={styles.templateButton}
          onClick={() => setShowClone(!showClone)}
          disabled={loading}
        >
          {showClone ? 'Hide' : 'Clone as Template'}
        </button>
      </div>
      {showClone && (
        <CloneForm grouped={grouped} loading={loading} onClone={onClone} />
      )}
    </div>
  );
}

function ExamplesSection() {
  const [showExamples, setShowExamples] = useState(false);
  return (
    <div className={styles.examplesSection}>
      <button
        className={styles.examplesToggle}
        type="button"
        aria-expanded={showExamples}
        aria-controls="examples-panel"
        onClick={() => setShowExamples(!showExamples)}
      >
        {showExamples ? '▾' : '▸'} What makes a good brief?
      </button>
      {showExamples && (
        <div id="examples-panel" className={styles.examples}>
          <div className={styles.exampleItem}>
            <span className={styles.exampleLabel}>Quick request</span>
            <p className={styles.exampleText}>
              &ldquo;Add a bartender named Diego who works at the Plaza and knows about the lithium leak&rdquo;
            </p>
          </div>
          <div className={styles.exampleItem}>
            <span className={styles.exampleLabel}>Story bible scale</span>
            <p className={styles.exampleText}>
              Paste a full character bio, scene breakdown, or worldbuilding doc — the AI will extract entities and structure them into a plan.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DescribeStep({ description, setDescription, onGenerate, loading, templates, onSelectTemplate, contentTree, onClone }: DescribeStepProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 1: Describe What You Want</h2>
      <p className={styles.description}>
        Describe new content to create, or describe the changes you want to make to existing content. The AI will generate a structured plan for your review.
      </p>

      <TemplatesSection templates={templates} loading={loading} onSelectTemplate={onSelectTemplate} />
      <CloneSection contentTree={contentTree} loading={loading} onClone={onClone} />

      <div className={styles.field}>
        <label className={styles.label}>Description *</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Add a bartender named Diego who works at the Plaza. He knows about the lithium leak and will give the player a clue if they ask the right questions."
        />
        <div className={styles.textareaFooter}>
          <span className={cn(styles.charCounter, description.length > 15_000 && styles.charCounterWarning)}>
            {description.length.toLocaleString()} characters
          </span>
          {description.length > 0 && (
            <span className={styles.guidance}>{getLengthGuidance(description.length)}</span>
          )}
        </div>
        {description.length >= SOFT_CAP && (
          <div className={styles.warningBanner}>
            Your description is very long — it will be sent as-is, but very large inputs may be slow or truncated by the LLM.
          </div>
        )}
      </div>

      <ExamplesSection />
      <button
        className={cn(styles.button, styles.primaryButton, (loading || !description.trim()) && styles.disabledButton)}
        onClick={onGenerate}
        disabled={loading || !description.trim()}
      >
        {loading ? 'Generating Plan...' : 'Generate Plan'}
      </button>
      <p className={styles.hint}>Press Ctrl+Enter to generate</p>
    </div>
  );
}
