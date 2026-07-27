'use client';

import { useState, useEffect } from 'react';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import styles from './settings.module.css';

interface Setting {
  key: string;
  value: any;
  description: string | null;
  updated_at: string;
}

interface SettingsResponse {
  settings: Setting[];
}

function SettingRow({
  setting,
  onSave,
  saving,
}: {
  setting: Setting;
  onSave: (key: string, value: any, description?: string) => Promise<boolean>;
  saving: boolean;
}) {
  const [editValue, setEditValue] = useState(
    typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value, null, 2)
  );
  const [isEditing, setIsEditing] = useState(false);

  async function handleSave() {
    let parsed;
    if (typeof setting.value === 'string') {
      parsed = editValue;
    } else {
      try {
        parsed = JSON.parse(editValue);
      } catch {
        alert('Invalid JSON value');
        return;
      }
    }
    const ok = await onSave(setting.key, parsed, setting.description ?? undefined);
    if (ok) {
      setIsEditing(false);
    }
  }

  return (
    <div className={styles.settingRow}>
      <div className={styles.settingHeader}>
        <span className={styles.settingKey}>{setting.key}</span>
        {setting.description && (
          <span className={cn('muted', styles.settingDesc)}>{setting.description}</span>
        )}
      </div>
      {isEditing ? (
        <div className={styles.settingEdit}>
          <label className="muted" htmlFor={`setting-value-${setting.key}`}>
            Value for <code>{setting.key}</code>
          </label>
          <textarea
            id={`setting-value-${setting.key}`}
            className={cn('textarea', styles.valueTextarea)}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            rows={3}
          />
          <div className={styles.editActions}>
            <button
              className={cn('btn', 'btn--primary', 'btn--small')}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              className={cn('btn', 'btn--secondary', 'btn--small')}
              onClick={() => {
                setEditValue(typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value, null, 2));
                setIsEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.settingValue}>
          <pre className={styles.valuePre}>{JSON.stringify(setting.value, null, 2)}</pre>
          <button
            className={cn('btn', 'btn--secondary', 'btn--small')}
            onClick={() => setIsEditing(true)}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchSettings() {
      try {
        const result = await adminFetch<{ success: boolean; data?: SettingsResponse; error?: string }>(
          '/admin/settings',
        );
        if (cancelled) return;
        if (result.success && result.data) {
          setSettings(result.data.settings);
        } else {
          setError(result.error || 'Failed to fetch settings');
        }
      } catch {
        if (cancelled) return;
        setError('Failed to fetch settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSettings();
    return () => { cancelled = true; };
  }, []);

  async function handleSave(key: string, value: any, description?: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const result = await adminFetch<{ success: boolean; error?: string }>(
        '/admin/settings',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value, description }),
        },
      );
      if (result.success) {
        setSettings(prev =>
          prev.map(s => s.key === key ? { ...s, value, updated_at: new Date().toISOString() } : s)
        );
        return true;
      } else {
        setError(result.error || 'Failed to save setting');
        return false;
      }
    } catch {
      setError('Failed to save setting');
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>System Settings</h1>
      {error && <div className="error-box">{error}</div>}
      {loading ? (
        <p className="muted">Loading settings...</p>
      ) : settings.length === 0 ? (
        <p className="muted">No settings found.</p>
      ) : (
        <div className={styles.settingsList}>
          {settings.map(setting => (
            <SettingRow
              key={setting.key}
              setting={setting}
              onSave={handleSave}
              saving={saving}
            />
          ))}
        </div>
      )}
    </main>
  );
}
