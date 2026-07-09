/* eslint-disable max-lines */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import AdminNav from '../components/AdminNav';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

type Step = 1 | 2 | 3 | 4;

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
    width: '100%', padding: '0.75rem', backgroundColor: '#0d0d1a', color: '#00ff00',
    border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9rem',
    minHeight: '120px', resize: 'vertical' as const, boxSizing: 'border-box' as const,
  },
  select: {
    padding: '0.5rem', backgroundColor: '#0d0d1a', color: '#00ff00',
    border: '1px solid #333', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9rem',
  },
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
    width: '100%', boxSizing: 'border-box' as const,
  },
  card: {
    border: '1px solid #333', padding: '1rem', borderRadius: '5px', marginBottom: '0.75rem',
    backgroundColor: '#0d0d1a',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
  cardType: { backgroundColor: '#00ff0022', color: '#00ff00', padding: '0.15rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold' as const },
  cardAction: { fontSize: '0.75rem', color: '#888' },
  assetTag: { display: 'inline-block', backgroundColor: '#ff000022', color: '#ff6666', padding: '0.15rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem', marginRight: '0.5rem', marginBottom: '0.25rem' },
  assetStatus: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold' as const },
  fileItem: { padding: '0.4rem 0', borderBottom: '1px solid #222', fontSize: '0.85rem', color: '#aaa' },
};

const stepLabels = ['Describe', 'Review Plan', 'Execute', 'Assets'];

const CONTENT_TYPES = ['character', 'dialogue', 'scene', 'overlay', 'mission', 'story', 'shop_item', 'location', 'map_tile', 'story_beat', 'gig', 'vault'];

async function postJSON<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP error ${res.status}: ${text || res.statusText}`);
  }
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('Expected JSON response from server');
  }
  return res.json();
}

function PlanItemCard({ item, index, onFieldChange, onFieldsChange, onRemove }: {
  item: ContentPlanItem; index: number;
  onFieldChange: (i: number, field: 'name' | 'slug' | 'type' | 'action', value: string) => void;
  onFieldsChange: (i: number, fields: Record<string, unknown>) => void;
  onRemove: (i: number) => void;
}) {
  const [fieldsEditor, setFieldsEditor] = useState(() => JSON.stringify(item.fields, null, 2));
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  function handleFieldsBlur() {
    try {
      const parsed = JSON.parse(fieldsEditor);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setFieldsError('Fields must be a JSON object');
        return;
      }
      onFieldsChange(index, parsed);
      setFieldsError(null);
    } catch (e: any) {
      setFieldsError(e.message);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={styles.cardType}>{item.type}</span>
          <span style={styles.cardAction}>{item.action}</span>
        </div>
        <button
          style={{ ...styles.button, ...styles.dangerButton, fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
          onClick={() => onRemove(index)}
        >
          Remove
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
        <div>
          <label style={styles.label}>Name</label>
          <input style={styles.miniInput} value={item.name} onChange={e => onFieldChange(index, 'name', e.target.value)} placeholder="Name" />
        </div>
        <div>
          <label style={styles.label}>Slug</label>
          <input style={styles.miniInput} value={item.slug} onChange={e => onFieldChange(index, 'slug', e.target.value)} placeholder="slug_name" />
        </div>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <label style={styles.label}>Type</label>
        <select style={{ ...styles.miniInput, width: '100%' }} value={item.type} onChange={e => onFieldChange(index, 'type', e.target.value)}>
          {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <label style={styles.label}>Fields (JSON)</label>
        <textarea
          style={{ ...styles.textarea, minHeight: '80px', fontSize: '0.8rem' }}
          value={fieldsEditor}
          onChange={e => setFieldsEditor(e.target.value)}
          onBlur={handleFieldsBlur}
          placeholder='{"description": "..."}'
        />
        {fieldsError && <p style={{ color: '#ff6666', fontSize: '0.75rem', marginTop: '0.25rem' }}>Invalid JSON: {fieldsError}</p>}
      </div>
      {item.assetNeeds.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={styles.label}>Asset Needs</label>
          <div>{item.assetNeeds.map((an, j) => <span key={j} style={styles.assetTag}>{an.promptType}: {an.targetField} [{an.status}]</span>)}</div>
        </div>
      )}
      {item.dependsOn.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <label style={styles.label}>Depends On</label>
          <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{item.dependsOn.join(', ')}</div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
export default function StoryBuilderPage() {
  const [step, setStep] = useState<Step>(1);
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);

  async function handleGeneratePlan() {
    setLoading(true);
    setError(null);
    try {
      const data = await postJSON<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(
        '/api/admin/story-builder/plan',
        { description }
      );
      if (data.success && data.data) {
        setPlan(data.data.plan);
        setStep(2);
      } else {
        setError(data.error || 'Failed to generate plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecutePlan() {
    if (!plan) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postJSON<{ success: boolean; data?: any; error?: string }>(
        '/api/admin/story-builder/execute',
        { plan }
      );
      if (data.success && data.data) {
        setExecutionResult(data.data);
        setStep(4);
      } else {
        setError(data.error || 'Failed to execute plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItemField(index: number, field: 'name' | 'slug' | 'type' | 'action', value: string) {
    if (!plan) return;
    const items = [...plan.items];
    items[index] = { ...items[index], [field]: value };
    setPlan({ ...plan, items });
  }

  function updateItemFields(index: number, fields: Record<string, unknown>) {
    if (!plan) return;
    const items = [...plan.items];
    items[index] = { ...items[index], fields };
    setPlan({ ...plan, items });
  }

  function removeItem(index: number) {
    if (!plan) return;
    setPlan({ ...plan, items: plan.items.filter((_, i) => i !== index) });
  }

  function addItem() {
    if (!plan) return;
    const newItem: ContentPlanItem = {
      id: crypto.randomUUID(),
      type: 'character' as const,
      action: 'create' as const,
      name: '',
      slug: '',
      fields: {},
      assetNeeds: [],
      dependsOn: [],
    };
    setPlan({ ...plan, items: [...plan.items, newItem] });
  }

  function renderStep1() {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 1: Describe What You Want</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Describe the content you want to create in natural language. The AI will generate a structured plan for your review.
        </p>
        <div style={styles.field}>
          <label style={styles.label}>Description *</label>
          <textarea
            style={styles.textarea}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Add a bartender named Diego who works at the Plaza. He knows about the lithium leak and will give the player a clue if they ask the right questions."
          />
        </div>
        <button
          style={{
            ...styles.button,
            ...styles.primaryButton,
            ...(loading || !description.trim() ? styles.disabledButton : {}),
          }}
          onClick={handleGeneratePlan}
          disabled={loading || !description.trim()}
        >
          {loading ? 'Generating Plan...' : 'Generate Plan'}
        </button>
      </div>
    );
  }

  function renderStep2() {
    if (!plan) return null;
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 2: Review Plan ({plan.items.length} items)</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Review and edit the generated plan items before execution.
        </p>
        {plan.items.map((item, i) => (
          <PlanItemCard key={item.id} item={item} index={i} onFieldChange={updateItemField} onFieldsChange={updateItemFields} onRemove={removeItem} />
        ))}
        <button style={{ ...styles.button, ...styles.secondaryButton, marginTop: '0.5rem' }} onClick={addItem}>
          + Add Item
        </button>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 3: Execute Plan</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Execute the plan to create content files, run validation, and apply migrations.
        </p>
        <div style={styles.subsection}>
          <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Plan Summary</h3>
          <p style={{ fontSize: '0.85rem', color: '#aaa' }}>
            {plan?.items.length ?? 0} items to create/update
          </p>
        </div>
        <button
          style={{
            ...styles.button,
            ...styles.primaryButton,
            ...(loading ? styles.disabledButton : {}),
          }}
          onClick={handleExecutePlan}
          disabled={loading}
        >
          {loading ? 'Executing...' : 'Execute Plan'}
        </button>
      </div>
    );
  }

  function renderStep4() {
    if (!executionResult) return null;
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 4: Results & Assets</h2>

        {executionResult.success ? (
          <div style={styles.successBox}>
            <p style={{ fontWeight: 'bold' }}>Plan executed successfully!</p>
          </div>
        ) : (
          <div style={styles.errorBox}>
            <p style={{ fontWeight: 'bold' }}>Execution failed: {executionResult.error || 'Validation failed'}</p>
          </div>
        )}

        {(executionResult.createdFiles?.length ?? 0) > 0 && (
          <div style={styles.subsection}>
            <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Created Files</h3>
            {executionResult.createdFiles.map((f: string) => (
              <div key={f} style={styles.fileItem}>{f}</div>
            ))}
          </div>
        )}

        {(executionResult.validationErrors?.length ?? 0) > 0 && (
          <div style={styles.subsection}>
            <h3 style={{ color: '#ff4444', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Validation Errors</h3>
            {executionResult.validationErrors.map((e: string, i: number) => (
              <div key={i} style={{ ...styles.fileItem, color: '#ff6666' }}>{e}</div>
            ))}
          </div>
        )}

        {(executionResult.assetTasks?.length ?? 0) > 0 && (
          <div style={styles.subsection}>
            <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Asset Needs</h3>
            {executionResult.assetTasks.map((task: any, i: number) => (
              <div key={i} style={{ marginBottom: '0.75rem' }}>
                <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                  {task.item.name} ({task.item.type})
                </p>
                <div>
                  {task.needs.map((an: any, j: number) => (
                    <span key={j} style={{
                      ...styles.assetStatus,
                      backgroundColor: an.status === 'pending' ? '#ff000022' : '#00ff0022',
                      color: an.status === 'pending' ? '#ff6666' : '#00ff00',
                    }}>
                      {an.promptType}: {an.targetField} [{an.status}]
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <Link href="/assets" style={{ ...styles.button, ...styles.secondaryButton, textDecoration: 'none', marginTop: '0.5rem', display: 'inline-block' }}>
              Go to Assets
            </Link>
          </div>
        )}

        <div style={styles.subsection}>
          <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Migration Result</h3>
          <pre style={{ fontSize: '0.8rem', color: '#aaa', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(executionResult.migrationResult, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return null;
    }
  };

  return (
    <main style={styles.main}>
      <AdminNav />
      <h1 style={styles.heading}>Story Builder</h1>

      <div style={styles.progressBar}>
        {stepLabels.map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              ...styles.stepDot,
              ...(i + 1 === step ? styles.stepActive : i + 1 < step ? styles.stepDone : styles.stepPending),
            }}>
              {i + 1 < step ? '\u2713' : i + 1}
            </div>
            <span style={{ fontSize: '0.75rem', color: i + 1 === step ? '#00ff00' : '#888' }}>{label}</span>
            {i < stepLabels.length - 1 && <div style={styles.stepLine} />}
          </div>
        ))}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {renderStep()}

      <div style={styles.navBar}>
        {step > 1 && step < 4 && (
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => setStep((step - 1) as Step)}
          >
            &larr; Back
          </button>
        )}
        {step === 2 && (
          <button
            style={{
              ...styles.button,
              ...styles.primaryButton,
              ...((!plan || plan.items.length === 0) ? styles.disabledButton : {}),
            }}
            onClick={() => setStep(3)}
            disabled={!plan || plan.items.length === 0}
          >
            Approve &amp; Execute &rarr;
          </button>
        )}
        {step === 4 && (
          <>
            <Link href="/assets" style={{ ...styles.button, ...styles.primaryButton, textDecoration: 'none' }}>
              View Assets
            </Link>
            <button
              style={{ ...styles.button, ...styles.secondaryButton }}
              onClick={() => {
                setStep(1);
                setDescription('');
                setPlan(null);
                setExecutionResult(null);
                setError(null);
              }}
            >
              Create Another
            </button>
          </>
        )}
      </div>
    </main>
  );
}
