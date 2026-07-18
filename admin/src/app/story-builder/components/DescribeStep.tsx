'use client';

import { useState } from 'react';
import { cn } from '@las-flores/ui';
import styles from './DescribeStep.module.css';

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

export default function DescribeStep({ description, setDescription, onGenerate, loading, templates, onSelectTemplate, contentTree, onClone }: DescribeStepProps) {
  const [cloneSource, setCloneSource] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [showClone, setShowClone] = useState(false);

  const grouped = contentTree.reduce<Record<string, typeof contentTree>>((acc, entry) => {
    (acc[entry.type] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 1: Describe What You Want</h2>
      <p className={styles.description}>
        Describe new content to create, or describe the changes you want to make to existing content. The AI will generate a structured plan for your review.
      </p>

      {templates.length > 0 && (
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
      )}


      {contentTree.length > 0 && (
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
            <div className={styles.cloneForm}>
              <div className={styles.field}>
                <label className={styles.label}>Source Entity *</label>
                <select
                  className={styles.select}
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
                <label className={styles.label}>New Name *</label>
                <input
                  className={styles.input}
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
          )}
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Description *</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Add a bartender named Diego who works at the Plaza. He knows about the lithium leak and will give the player a clue if they ask the right questions."
        />
      </div>
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
