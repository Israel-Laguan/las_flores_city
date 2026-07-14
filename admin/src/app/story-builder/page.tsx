/* eslint-disable max-lines */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminNav from '../components/AdminNav';
import ContentCard from './components/ContentCard';
import PlanSummary from './components/PlanSummary';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';

type Step = 1 | 2 | 3 | 4 | 5;

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

const stepLabels = ['Describe', 'Review & Refine', 'Stage', 'Migrate', 'Assets'];

// JSON syntax highlighting colors
const jsonStyles = {
  key: { color: '#00ff00' },
  string: { color: '#ffff00' },
  number: { color: '#ff8800' },
  boolean: { color: '#0088ff' },
  null: { color: '#888888' },
  bracket: { color: '#aaaaaa' },
  colon: { color: '#aaaaaa' },
  comma: { color: '#aaaaaa' },
};

// Format JSON with syntax highlighting
function syntaxHighlightJSON(json: unknown): JSX.Element {
  const stringified = JSON.stringify(json, null, 2);
  const tokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\]:,]|\s+|[^"\s{}[\]:,]+)/g;

  return (
    <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace' }}>
      {stringified.split('\n').map((line, i) => {
        const tokens: JSX.Element[] = [];
        let match;
        tokenRegex.lastIndex = 0;

        while ((match = tokenRegex.exec(line)) !== null) {
          const token = match[0];
          let style: React.CSSProperties = {};

          if (token.startsWith('"')) {
            const isKey = line.substring(match.index + token.length).trim().startsWith(':');
            style = isKey ? jsonStyles.key : jsonStyles.string;
          } else if (token === 'true' || token === 'false') {
            style = jsonStyles.boolean;
          } else if (token === 'null') {
            style = jsonStyles.null;
          } else if (/^[0-9-]/.test(token)) {
            style = jsonStyles.number;
          } else if ('{}[]'.includes(token)) {
            style = jsonStyles.bracket;
          } else if (token === ':') {
            style = jsonStyles.colon;
          } else if (token === ',') {
            style = jsonStyles.comma;
          }

          tokens.push(
            <span key={match.index} style={style}>
              {token}
            </span>
          );
        }

        return (
          <div key={i} style={{ display: 'block' }}>
            {tokens}
          </div>
        );
      })}
    </pre>
  );
}

// Collapsible JSON viewer component
function JsonViewer({ data, label = 'JSON Data', defaultOpen = false }: { 
  data: unknown; 
  label?: string; 
  defaultOpen?: boolean 
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <details style={{ marginTop: '0.5rem' }} open={isOpen}>
      <summary 
        style={{ 
          color: '#00ff00', 
          fontSize: '0.85rem', 
          cursor: 'pointer',
          padding: '0.25rem 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
        onClick={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        <span>{label}</span>
        <span style={{ color: '#888', fontSize: '0.75rem' }}>
          {isOpen ? '\u25B2' : '\u25BC'} {data && typeof data === 'object' && data !== null && Object.keys(data).length > 0 ? `(${Object.keys(data).length} items)` : ''}
        </span>
      </summary>
      <div style={{ 
        backgroundColor: '#0d0d1a', 
        padding: '0.75rem', 
        borderRadius: '5px',
        marginTop: '0.25rem',
        border: '1px solid #333'
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <button
            style={{ 
              ...styles.button, 
              ...styles.secondaryButton,
              fontSize: '0.75rem',
              padding: '0.25rem 0.5rem'
            }}
            onClick={copyToClipboard}
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
        {syntaxHighlightJSON(data)}
      </div>
    </details>
  );
}

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

// eslint-disable-next-line max-lines-per-function
export default function StoryBuilderPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(1);
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [refineFeedback, setRefineFeedback] = useState('');
  const [showRefine, setShowRefine] = useState(false);
  const [stagingResult, setStagingResult] = useState<any>(null);
  const [migrationResult, setMigrationResult] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; label: string; description: string; icon: string }>>([]);

  useEffect(() => {
    const id = searchParams.get('planId');
    if (id) {
      setPlanId(id);
      loadPlanFromDb(id);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/admin/story-builder/templates')
      .then(res => res.json())
      .then(data => { if (data.success) setTemplates(data.data.templates); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+Enter — generate plan (in Step 1)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && step === 1 && description.trim() && !loading) {
        e.preventDefault();
        handleGeneratePlan();
      }

      // Ctrl+S — save plan (in Step 2)
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && planId && step === 2) {
        e.preventDefault();
        // Save is already auto-saved, just show a brief confirmation
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, description, planId, loading]);

  async function loadPlanFromDb(id: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/story-builder/plans/${id}`);
      const data = await res.json();
      if (data.success) {
        setPlan(data.data.plan_json);
        setDescription(data.data.description);
        setStep(2);
      } else {
        setError(data.error || 'Failed to load plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
        // Auto-save to DB
        try {
          const saveRes = await postJSON<{ success: boolean; data?: { planId: string } }>(
            '/api/admin/story-builder/plans',
            { description, plan: data.data.plan }
          );
          if (saveRes.success && saveRes.data) {
            setPlanId(saveRes.data.planId);
          }
        } catch (e) {
          // Non-fatal: plan still works in session
          console.error('Auto-save failed:', e);
        }
      } else {
        setError(data.error || 'Failed to generate plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefine() {
    if (!planId || !refineFeedback.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postJSON<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(
        `/api/admin/story-builder/plans/${planId}/refine`,
        { feedback: refineFeedback }
      );
      if (data.success && data.data) {
        setPlan(data.data.plan);
        setRefineFeedback('');
        setShowRefine(false);
      } else {
        setError(data.error || 'Failed to refine plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview() {
    if (!planId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postJSON<{ success: boolean; data?: any; error?: string }>(
        `/api/admin/story-builder/plans/${planId}/preview`,
        {}
      );
      if (data.success && data.data) {
        setPreviewData(data.data);
      } else {
        setError(data.error || 'Failed to preview plan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStage() {
    if (!planId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postJSON<{ success: boolean; data?: any; error?: string }>(
        `/api/admin/story-builder/plans/${planId}/stage`,
        {}
      );
      if (data.success) {
        setStagingResult(data.data);
        setStep(4);
      } else {
        setStagingResult(data.data);
        setError(data.data?.error || 'Staging failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMigrate() {
    if (!planId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await postJSON<{ success: boolean; data?: any; error?: string }>(
        `/api/admin/story-builder/plans/${planId}/migrate`,
        {}
      );
      if (data.success) {
        setMigrationResult(data.data);
        setStep(5);
      } else {
        setMigrationResult(data.data);
        setError(data.data?.error || 'Migration failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItemField(index: number, fieldPath: string, value: string) {
    if (!plan) return;
    const items = [...plan.items];
    const item = { ...items[index] };
    const fields = { ...item.fields };

    const parts = fieldPath.split('.');
    let current: any = fields;
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = { ...(current[parts[i]] || {}) };
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;

    items[index] = { ...item, fields };
    setPlan({ ...plan, items });
  }

  function updateItemDependsOn(index: number, dependsOn: string[]) {
    if (!plan) return;
    const items = [...plan.items];
    items[index] = { ...items[index], dependsOn };
    setPlan({ ...plan, items });
  }

  function addLink() {
    if (!plan || plan.items.length < 2) return;
    const newLink = {
      fromItem: plan.items[0].id,
      toItem: plan.items[1].id,
      field: '',
      action: 'add' as const,
    };
    setPlan({ ...plan, links: [...plan.links, newLink] });
  }

  function updateLink(index: number, field: string, value: string) {
    if (!plan) return;
    const links = [...plan.links];
    if (!links[index]) return;
    links[index] = { ...links[index], [field]: value };
    setPlan({ ...plan, links });
  }

  function removeLink(index: number) {
    if (!plan) return;
    setPlan({ ...plan, links: plan.links.filter((_, i) => i !== index) });
  }

  function removeItem(index: number) {
    if (!plan) return;
    const removedId = plan.items[index].id;
    const items = plan.items
      .filter((_, i) => i !== index)
      .map(item => ({
        ...item,
        dependsOn: item.dependsOn.filter(id => id !== removedId),
      }));
    const links = plan.links.filter(
      link => link.fromItem !== removedId && link.toItem !== removedId
    );
    setPlan({ ...plan, items, links });
  }

  function removeAssetPath(index: number, key: string) {
    if (!plan) return;
    const items = [...plan.items];
    const item = { ...items[index] };
    const fields = { ...item.fields };
    const assetPaths = { ...(fields.asset_paths || {}) };
    delete assetPaths[key];
    fields.asset_paths = assetPaths;
    items[index] = { ...item, fields };
    setPlan({ ...plan, items });
  }

  function addItem() {
    if (!plan) return;
    const newItem: ContentPlanItem = {
      id: crypto.randomUUID(),
      type: 'character' as const,
      action: 'create' as const,
      name: '',
      description: '',
      slug: '',
      fields: {},
      assetNeeds: [],
      dependsOn: [],
    };
    setPlan({ ...plan, items: [...plan.items, newItem] });
  }

  function renderTemplatesSection() {
    if (templates.length === 0) return null;
    return (
      <div style={{ ...styles.subsection, marginBottom: '1rem' }}>
        <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Quick Start Templates</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {templates.map(t => (
            <button
              key={t.id}
              style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.85rem' }}
              onClick={async () => {
                setLoading(true);
                try {
                  const data = await postJSON<{ success: boolean; data?: { plan: ContentPlan }; error?: string }>(
                    `/api/admin/story-builder/templates/${t.id}`,
                    { description: description || t.label }
                  );
                  if (data.success && data.data) {
                    setPlan(data.data.plan);
                    setStep(2);
                    // Auto-save to DB (same as handleGeneratePlan)
                    try {
                      const saveRes = await postJSON<{ success: boolean; data?: { planId: string } }>(
                        '/api/admin/story-builder/plans',
                        { description: description || t.label, plan: data.data.plan }
                      );
                      if (saveRes.success && saveRes.data) {
                        setPlanId(saveRes.data.planId);
                      }
                    } catch (e) {
                      console.error('Auto-save failed:', e);
                    }
                  } else {
                    setError(data.error || "Failed to build template plan");
                  }
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.5rem' }}>
          Click a template to generate a pre-configured plan. You can still edit everything in Step 2.
        </p>
      </div>
    );
  }

  function renderStep1() {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 1: Describe What You Want</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Describe the content you want to create in natural language. The AI will generate a structured plan for your review.
        </p>

        {renderTemplatesSection()}

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
        <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
          Press Ctrl+Enter to generate
        </p>
      </div>
    );
  }

  function renderRefineSection() {
    if (!showRefine) {
      return (
        <button style={{ ...styles.button, ...styles.secondaryButton, marginTop: '0.5rem' }} onClick={() => setShowRefine(true)}>
          Refine with AI Feedback
        </button>
      );
    }
    return (
      <div style={{ ...styles.subsection, marginTop: '1rem' }}>
        <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Refine with AI</h3>
        <textarea
          style={styles.textarea}
          value={refineFeedback}
          onChange={e => setRefineFeedback(e.target.value)}
          placeholder="e.g. Make Diego more cynical. Add a scene for the bar interior."
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            style={{ ...styles.button, ...styles.primaryButton, ...(loading || !refineFeedback.trim() ? styles.disabledButton : {}) }}
            onClick={handleRefine}
            disabled={loading || !refineFeedback.trim()}
          >
            {loading ? 'Refining...' : 'Send Feedback'}
          </button>
          <button style={{ ...styles.button, ...styles.secondaryButton }} onClick={() => setShowRefine(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function renderLinksSection() {
    if (!plan || plan.items.length < 2) return null;
    return (
      <div style={{ ...styles.subsection, marginTop: '1.5rem' }}>
        <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Content Links</h3>
        <p style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Link content items together (e.g., scene → dialogue, mission → story).
        </p>
        {plan.links.map((link, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <select
              style={{ ...styles.select, flex: 1 }}
              value={link.fromItem}
              onChange={e => updateLink(i, 'fromItem', e.target.value)}
            >
              {!plan.items.some(item => item.id === link.fromItem) && (
                <option value={link.fromItem}>Unknown/Deleted Item ({link.fromItem})</option>
              )}
              {plan.items.map(item => (
                <option key={item.id} value={item.id}>{item.name || item.slug} ({item.type})</option>
              ))}
            </select>
            <span style={{ color: '#888', fontSize: '0.85rem' }}>→</span>
            <select
              style={{ ...styles.select, flex: 1 }}
              value={link.toItem}
              onChange={e => updateLink(i, 'toItem', e.target.value)}
            >
              {!plan.items.some(item => item.id === link.toItem) && (
                <option value={link.toItem}>Unknown/Deleted Item ({link.toItem})</option>
              )}
              {plan.items.map(item => (
                <option key={item.id} value={item.id}>{item.name || item.slug} ({item.type})</option>
              ))}
            </select>
            <input
              style={{ ...styles.miniInput, width: '140px' }}
              value={link.field}
              onChange={e => updateLink(i, 'field', e.target.value)}
              placeholder="field name"
            />
            <select
              style={styles.select}
              value={link.action}
              onChange={e => updateLink(i, 'action', e.target.value)}
            >
              <option value="add">add</option>
              <option value="set">set</option>
            </select>
            <button
              style={{ ...styles.button, ...styles.dangerButton, fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              onClick={() => removeLink(i)}
            >
              ✕
            </button>
          </div>
        ))}
        <button style={{ ...styles.button, ...styles.secondaryButton, marginTop: '0.5rem' }} onClick={addLink}>
          + Add Link
        </button>
      </div>
    );
  }

  function renderStep2() {
    if (!plan) return null;
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 2: Review Plan</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Review and edit the proposed content. All text fields are editable.
        </p>

        <PlanSummary plan={plan} />

        {plan.items.map((item, i) => (
          <ContentCard
            key={item.id}
            item={item}
            index={i}
            allItems={plan.items}
            onFieldChange={updateItemField}
            onRemove={removeItem}
            onAssetPathRemove={removeAssetPath}
            onDependsOnChange={updateItemDependsOn}
          />
        ))}

        <button style={{ ...styles.button, ...styles.secondaryButton, marginTop: '0.5rem' }} onClick={addItem}>
          + Add Item
        </button>

        {renderRefineSection()}

        {renderLinksSection()}
      </div>
    );
  }

  function extractFieldsFromYaml(yamlString: string): Record<string, string> {
    const fields: Record<string, string> = {};
    try {
      // Simple parsing to extract top-level fields
      const lines = yamlString.split('\n');
      for (const line of lines) {
        // Skip nested fields by checking indentation of the original line
        if (line.startsWith(' ') || line.startsWith('\t')) {
          continue;
        }
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim();
          fields[key.trim()] = value || '(empty)';
        }
      }
    } catch (e) {
      // If parsing fails, return empty
    }
    return fields;
  }

  function getImageFromYaml(yamlString: string): string | null {
    try {
      const lines = yamlString.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Look for image_path or image fields at the top level
        if (trimmed.match(/^(image_path|image|portrait|thumbnail)\s*:/i)) {
          const match = trimmed.match(/:\s*(.+)/);
          if (match) {
            const path = match[1].trim().replace(/['"]/g, '');
            if (path && !path.startsWith('data:')) {
              return path;
            }
          }
        }

        // Look for asset_paths
        if (trimmed.match(/^asset_paths\s*:/i)) {
          let j = i + 1;
          while (j < lines.length) {
            const rawLine = lines[j];
            const trimmedNext = rawLine.trim();
            if (!trimmedNext || trimmedNext.startsWith('#')) {
              j++;
              continue;
            }
            // Ensure it is indented (nested under asset_paths)
            if (rawLine.startsWith(' ') || rawLine.startsWith('\t')) {
              const assetMatch = trimmedNext.match(/^\s*(\w+)\s*:\s*(.+)/);
              if (assetMatch) {
                const key = assetMatch[1];
                const value = assetMatch[2].trim().replace(/['"]/g, '');
                if (key.match(/image|portrait|avatar/i) && value) {
                  return value;
                }
              }
              j++;
            } else {
              break;
            }
          }
        }
      }
    } catch (e) {
      // If parsing fails, return null
    }
    return null;
  }

  // Preview item component to handle state per item
  function PreviewItem({ item, index }: { item: any; index: number }) {
    const [imageError, setImageError] = useState(false);
    const fields = extractFieldsFromYaml(item.yamlPreview);
    const imagePath = getImageFromYaml(item.yamlPreview);
    
    return (
      <div key={index} style={{ ...styles.card, marginBottom: '0.75rem' }}>
        <div style={styles.cardHeader}>
          <span style={styles.cardType}>{item.type}</span>
          <span style={styles.cardAction}>
            {item.isNew ? 'New' : 'Update'} &rarr; {item.filePath}
          </span>
        </div>
        
        {/* Display key fields clearly */}
        <div style={{ marginBottom: '0.5rem' }}>
          {fields.name && (
            <p style={{ color: '#00ff00', fontSize: '0.9rem', margin: '0.25rem 0' }}>
              <strong>Name:</strong> {fields.name}
            </p>
          )}
          {fields.description && (
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0.25rem 0', maxHeight: '100px', overflow: 'auto' }}>
              <strong>Description:</strong> {fields.description}
            </p>
          )}
          {fields.slug && (
            <p style={{ color: '#888', fontSize: '0.8rem', margin: '0.25rem 0' }}>
              <strong>Slug:</strong> {fields.slug}
            </p>
          )}
          {fields.id && (
            <p style={{ color: '#888', fontSize: '0.8rem', margin: '0.25rem 0' }}>
              <strong>ID:</strong> {fields.id}
            </p>
          )}
          
          {/* Display image if available */}
          {imagePath && !imageError && (
            <div style={{ margin: '0.5rem 0', padding: '0.5rem', backgroundColor: '#0a0a14', borderRadius: '5px', border: '1px solid #333' }}>
              <img
                src={`/api/admin/asset?path=${encodeURIComponent(imagePath)}`}
                alt="Preview"
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '200px', 
                  borderRadius: '5px',
                  objectFit: 'contain',
                  backgroundColor: '#1a1a2e'
                }}
                onError={() => setImageError(true)}
              />
              <p style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.25rem' }}>
                {imagePath}
              </p>
            </div>
          )}
        </div>
        
        {/* Raw YAML in collapsible section */}
        <details>
          <summary style={{ color: '#888', fontSize: '0.8rem', cursor: 'pointer', marginTop: '0.5rem' }}>
            View YAML
          </summary>
          <pre style={{ fontSize: '0.75rem', color: '#aaa', whiteSpace: 'pre-wrap', marginTop: '0.5rem', maxHeight: '200px', overflow: 'auto' }}>
            {item.yamlPreview}
          </pre>
        </details>
        {item.existingYaml && (
          <details>
            <summary style={{ color: '#ff6666', fontSize: '0.8rem', cursor: 'pointer' }}>Current File (will be overwritten)</summary>
            <pre style={{ fontSize: '0.75rem', color: '#888', whiteSpace: 'pre-wrap', marginTop: '0.5rem', maxHeight: '200px', overflow: 'auto' }}>
              {item.existingYaml}
            </pre>
          </details>
        )}
      </div>
    );
  }

  function renderPreviewFiles() {
    if (!previewData) return null;
    return (
      <div style={styles.subsection}>
        <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          Files Preview ({previewData.items.length} items)
        </h3>
        {previewData.items.map((item: any, i: number) => (
          <PreviewItem key={i} item={item} index={i} />
        ))}
      </div>
    );
  }

  function renderStagingSummary() {
    if (!stagingResult) return null;
    return (
      <>
        {stagingResult.createdFiles?.length > 0 && (
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Created: {stagingResult.createdFiles.join(', ')}
          </p>
        )}
        {stagingResult.updatedFiles?.length > 0 && (
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Updated: {stagingResult.updatedFiles.join(', ')}
          </p>
        )}
        {stagingResult.validationErrors?.length > 0 && (
          <ul style={{ fontSize: '0.85rem', marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
            {stagingResult.validationErrors.map((e: string, i: number) => (
              <li key={i} style={{ color: '#ff6666' }}>{e}</li>
            ))}
          </ul>
        )}
        {stagingResult.loreFiles?.length > 0 && (
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Lore files created: {stagingResult.loreFiles.join(', ')}
          </p>
        )}
        {stagingResult.promptFiles?.length > 0 && (
          <div style={{ marginTop: '0.25rem' }}>
            <p style={{ fontSize: '0.85rem' }}>
              Prompt files created: {stagingResult.promptFiles.join(', ')}
            </p>
            <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
              These can be used in the <a href="/assets" style={{ color: '#00ff00' }}>Asset Pipeline</a>.
            </p>
          </div>
        )}
      </>
    );
  }

  function renderStagingItemResults() {
    if (!stagingResult?.itemResults) return null;
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Item Status</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <tbody>
            {stagingResult.itemResults.map((r: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '0.4rem', color: '#aaa' }}>{r.name}</td>
                <td style={{ padding: '0.4rem' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold' as const,
                    backgroundColor: r.status === 'success' ? '#00ff0022' : '#ff000022',
                    color: r.status === 'success' ? '#00ff00' : '#ff4444',
                  }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: '0.4rem', color: '#888', fontSize: '0.8rem' }}>{r.error || r.filePath || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!stagingResult.success && planId && (
          <button
            style={{
              ...styles.button,
              ...styles.secondaryButton,
              marginTop: '0.75rem',
            }}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const data = await postJSON<{ success: boolean; data?: any; error?: string }>(
                  `/api/admin/story-builder/plans/${planId}/retry`,
                  {}
                );
                if (data.success) {
                  setStagingResult(data.data);
                  if (data.data?.success) {
                    setStep(4); // Move to Migrate step on success
                  }
                } else {
                  setError(data.error || 'Retry failed');
                }
              } catch (err: any) {
                setError(err.message);
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? 'Retrying...' : '🔄 Retry Failed Items'}
          </button>
        )}
      </div>
    );
  }

  function renderStep3() {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 3: Stage Content</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Preview the files that will be created, then stage them. Staging writes YAML files and validates them — but does NOT migrate to the database yet.
        </p>

        <button
          style={{ ...styles.button, ...styles.secondaryButton, marginBottom: '1rem' }}
          onClick={handlePreview}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Preview Files'}
        </button>

        {renderPreviewFiles()}

        {stagingResult && (
          <div style={stagingResult.success ? styles.successBox : styles.errorBox}>
            <p style={{ fontWeight: 'bold' }}>
              {stagingResult.success ? 'Staged successfully!' : 'Staging failed'}
            </p>
            {renderStagingSummary()}
            {renderStagingItemResults()}
          </div>
        )}

        <button
          style={{
            ...styles.button,
            ...styles.primaryButton,
            ...(loading ? styles.disabledButton : {}),
          }}
          onClick={handleStage}
          disabled={loading}
        >
          {loading ? 'Staging...' : 'Stage Content'}
        </button>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 4: Migrate to Database</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Content files are staged and validated. Click migrate to upsert them into the database.
        </p>

        {stagingResult && (
          <div style={styles.subsection}>
            <h3 style={{ color: '#00ff00', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Staged Files</h3>
            <p style={{ fontSize: '0.85rem', color: '#aaa' }}>
              {stagingResult.createdFiles?.length ?? 0} new, {stagingResult.updatedFiles?.length ?? 0} updated
            </p>
          </div>
        )}

        {migrationResult && (
          <div style={migrationResult.success ? styles.successBox : styles.errorBox}>
            <p style={{ fontWeight: 'bold' }}>
              {migrationResult.success ? 'Migration complete!' : 'Migration failed'}
            </p>
            {migrationResult.error && (
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: '#ff6666' }}>{migrationResult.error}</p>
            )}
            {migrationResult.migrationResult && (
              <JsonViewer data={migrationResult.migrationResult} label="Migration Details" defaultOpen={!migrationResult.success} />
            )}
          </div>
        )}

        <button
          style={{
            ...styles.button,
            ...styles.primaryButton,
            ...(loading ? styles.disabledButton : {}),
          }}
          onClick={handleMigrate}
          disabled={loading}
        >
          {loading ? 'Migrating...' : 'Migrate to Database'}
        </button>
      </div>
    );
  }

  function renderStep5() {
    if (!migrationResult) return null;
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Step 5: Results & Assets</h2>

        {migrationResult.success ? (
          <div style={styles.successBox}>
            <p style={{ fontWeight: 'bold' }}>Migration complete!</p>
            {migrationResult.migrationResult && (
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                Processed {migrationResult.migrationResult.filesProcessed ?? 0} files.
              </p>
            )}
          </div>
        ) : (
          <div style={styles.errorBox}>
            <p style={{ fontWeight: 'bold' }}>Migration failed</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {migrationResult.error || 'Unknown error'}
            </p>
          </div>
        )}

        {migrationResult.migrationResult && (
          <JsonViewer data={migrationResult.migrationResult} label="Full Migration Results" defaultOpen={false} />
        )}

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <Link href="/assets" style={{ ...styles.button, ...styles.primaryButton, textDecoration: 'none' }}>
            View Assets
          </Link>
          <Link href="/story-builder" style={{ ...styles.button, ...styles.secondaryButton, textDecoration: 'none' }}>
            New Plan
          </Link>
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
      case 5: return renderStep5();
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
        {step > 1 && step < 5 && (
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
            Approve &amp; Stage &rarr;
          </button>
        )}
        {planId && (
          <Link href="/story-builder/plans" style={{ ...styles.button, ...styles.secondaryButton, textDecoration: 'none' }}>
            Save &amp; Close
          </Link>
        )}
      </div>
    </main>
  );
}
