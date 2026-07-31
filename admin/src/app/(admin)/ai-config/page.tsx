'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/client-api';
import styles from './ai-config.module.css';

interface AiConfigData {
  provider: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
  model: string;
  timeoutMs: number;
  maxTimeoutMs: number;
  outlineModel: string;
  outlineMaxTokens: number;
  outlineInitialMaxItems: number;
  outlineContextDepth: string;
  planOutlineMaxInputChars: number;
  planFillConcurrency: number;
  planFillTimeoutMs: number;
  priceTableConfigured: boolean;
}

interface ConfigField {
  key: string;
  label: string;
  value: string | number | boolean;
  envVar: string;
  note?: string;
}

function fieldValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  return value;
}

function ConfigCard({ title, fields }: { title: string; fields: ConfigField[] }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>{title}</h2>
      <dl className={styles.fieldList}>
        {fields.map((f) => (
          <div key={f.key} className={styles.fieldRow}>
            <dt className={styles.fieldLabel}>{f.label}</dt>
            <dd className={styles.fieldValue}>
              <code className={styles.valueCode}>{fieldValue(f.value)}</code>
              <span className={styles.envVar}>set via <code>{f.envVar}</code></span>
              {f.note && <span className={styles.fieldNote}>{f.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AiConfigPage() {
  const [config, setConfig] = useState<AiConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const data = await adminFetch<{ success: boolean; data: AiConfigData }>('/admin/ai-config');
        if (data.success) {
          setConfig(data.data);
        } else {
          setError('Failed to load AI configuration');
        }
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  if (loading) return <main className={styles.main}><p className={styles.muted}>Loading AI configuration...</p></main>;
  if (error) return <main className={styles.main}><div className={styles.errorBox}>{error}</div></main>;
  if (!config) return <main className={styles.main}><p className={styles.muted}>No configuration available.</p></main>;

  const providerFields: ConfigField[] = [
    { key: 'provider', label: 'Provider', value: config.provider, envVar: 'LLM_PROVIDER' },
    { key: 'baseUrl', label: 'Base URL', value: config.baseUrl, envVar: 'LITELLM_BASE_URL', note: 'Host only; credentials redacted' },
    { key: 'apiKey', label: 'API Key', value: config.apiKeyConfigured ? config.apiKeyMasked : 'Not configured', envVar: 'LITELLM_API_KEY', note: 'Secret — masked in display' },
    { key: 'model', label: 'Model', value: config.model, envVar: 'LLM_MODEL' },
  ];

  const timeoutFields: ConfigField[] = [
    { key: 'timeoutMs', label: 'Default Timeout', value: `${config.timeoutMs}ms`, envVar: 'LLM_TIMEOUT_MS' },
    { key: 'maxTimeoutMs', label: 'Max Timeout', value: `${config.maxTimeoutMs}ms`, envVar: 'LLM_MAX_TIMEOUT_MS' },
    { key: 'planFillTimeoutMs', label: 'Fill Timeout', value: `${config.planFillTimeoutMs}ms`, envVar: 'PLAN_FILL_TIMEOUT_MS' },
  ];

  const outlineFields: ConfigField[] = [
    { key: 'outlineModel', label: 'Outline Model', value: config.outlineModel, envVar: 'LLM_OUTLINE_MODEL', note: 'Falls back to LLM_MODEL if not set' },
    { key: 'outlineMaxTokens', label: 'Max Tokens', value: config.outlineMaxTokens, envVar: 'LLM_OUTLINE_MAX_TOKENS' },
    { key: 'outlineInitialMaxItems', label: 'Initial Max Items', value: config.outlineInitialMaxItems, envVar: 'LLM_OUTLINE_INITIAL_MAX_ITEMS' },
    { key: 'outlineContextDepth', label: 'Context Depth', value: config.outlineContextDepth, envVar: 'PLAN_OUTLINE_CONTEXT_DEPTH' },
    { key: 'planOutlineMaxInputChars', label: 'Max Input Characters', value: `${config.planOutlineMaxInputChars} chars`, envVar: 'PLAN_OUTLINE_MAX_INPUT_CHARS' },
    { key: 'planFillConcurrency', label: 'Fill Concurrency', value: config.planFillConcurrency, envVar: 'PLAN_FILL_CONCURRENCY' },
  ];

  const miscFields: ConfigField[] = [
    { key: 'priceTableConfigured', label: 'Price Table Configured', value: config.priceTableConfigured ? 'Yes' : 'No', envVar: 'LLM_PRICE_TABLE', note: config.priceTableConfigured ? 'Custom pricing loaded' : 'Using defaults' },
  ];

  return (
    <main className={styles.main}>
      <h1>AI Configuration</h1>
      <p className={styles.subtitle}>
        Current AI/LLM configuration loaded from environment variables. 
        Changes require restarting the server.
      </p>

      <div className={styles.grid}>
        <ConfigCard title="Provider" fields={providerFields} />
        <ConfigCard title="Timeouts" fields={timeoutFields} />
        <ConfigCard title="Outline &amp; Plan Generation" fields={outlineFields} />
        <ConfigCard title="Other" fields={miscFields} />
      </div>

      <div className={styles.links}>
        <h3>Reference</h3>
        <ul>
          <li><a href="https://github.com/Israel-Laguan/las_flores_city/blob/main/docs/PROMPT_GUIDELINES.md" target="_blank" rel="noopener noreferrer">Prompt Guidelines</a></li>
          <li><a href="/assets" target="_blank" rel="noopener noreferrer">Asset Prompt Catalog</a></li>
          <li><a href="/story-builder" target="_blank" rel="noopener noreferrer">Story Builder</a></li>
        </ul>
      </div>
    </main>
  );
}
