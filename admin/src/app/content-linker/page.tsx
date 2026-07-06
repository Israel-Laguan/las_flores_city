"use client";
/* eslint-disable max-lines */

import { useState, useEffect, useCallback } from 'react';

type Tab = 'scenes' | 'missions' | 'stories';

interface ListItem {
  id: string;
  name?: string;
  title?: string;
  [key: string]: unknown;
}

interface LinkOp {
  contentPath: string;
  fieldPath: string;
  action: 'add' | 'remove' | 'set';
  value: string;
}

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  tabBar: { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' },
  tab: {
    padding: '0.5rem 1.5rem', borderRadius: '5px', fontFamily: 'monospace', cursor: 'pointer',
    border: '1px solid #333', backgroundColor: 'transparent', color: '#aaa', fontSize: '0.9rem',
  },
  tabActive: {
    padding: '0.5rem 1.5rem', borderRadius: '5px', fontFamily: 'monospace', cursor: 'pointer',
    border: '1px solid #00ff00', backgroundColor: '#00ff0022', color: '#00ff00', fontSize: '0.9rem',
  },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  select: {
    padding: '0.5rem', backgroundColor: '#0d0d1a', color: '#00ff00', border: '1px solid #333',
    borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9rem', marginBottom: '1.5rem',
    minWidth: '300px',
  },
  listContainer: { marginBottom: '1.5rem' },
  listLabel: { color: '#888', fontSize: '0.85rem', marginBottom: '0.5rem' },
  listItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.5rem 0.75rem', borderBottom: '1px solid #222', fontSize: '0.9rem',
  },
  itemName: { flex: 1 },
  button: {
    padding: '0.4rem 0.8rem', borderRadius: '3px', fontFamily: 'monospace',
    cursor: 'pointer', border: 'none', fontSize: '0.8rem', fontWeight: 'bold' as const,
  },
  addButton: { backgroundColor: '#00ff00', color: '#000' },
  removeButton: { backgroundColor: '#ff4444', color: '#fff' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' as const },
  saveButton: {
    padding: '0.75rem 1.5rem', borderRadius: '5px', fontWeight: 'bold' as const, fontFamily: 'monospace',
    cursor: 'pointer', border: 'none', fontSize: '1rem', backgroundColor: '#00ff00', color: '#000',
    marginTop: '1rem',
  },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '0.75rem', borderRadius: '5px', marginBottom: '1rem' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '0.75rem', borderRadius: '5px', marginBottom: '1rem' },
  muted: { color: '#888' },
  emptyState: { color: '#555', textAlign: 'center' as const, padding: '2rem' },
  pendingBadge: { backgroundColor: '#ffaa00', color: '#000', padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', marginLeft: '0.5rem' },
};

const TAB_CONFIG: Record<Tab, { label: string; listEndpoint: string; entityName: string; sections: SectionConfig[] }> = {
  scenes: {
    label: '🗺️ Scenes',
    listEndpoint: '/api/admin/scenes',
    entityName: 'Scene',
    sections: [
      { field: 'available_dialogues', label: 'Linked Dialogues', availableEndpoint: '/api/admin/dialogues', idField: 'id', nameField: 'name', yamlDir: 'dialogues', fileType: 'dialogue' },
    ],
  },
  missions: {
    label: '🔍 Missions',
    listEndpoint: '/api/admin/mysteries',
    entityName: 'Mission',
    sections: [
      { field: 'mission_id', label: 'Linked Overlay (mission_id)', availableEndpoint: '/api/admin/overlays', idField: 'id', nameField: 'name', yamlDir: 'overlays', fileType: 'overlay', scalar: true },
      { field: 'vault_items', label: 'Vault Items (mission_id)', availableEndpoint: '/api/admin/vault', idField: 'id', nameField: 'title', yamlDir: 'vault', fileType: 'vault', scalar: false, arrayItemPath: 'mission_id' },
    ],
  },
  stories: {
    label: '📚 Stories',
    listEndpoint: '/api/admin/stories',
    entityName: 'Story',
    sections: [
      { field: 'mission_id', label: 'Linked Mission', availableEndpoint: '/api/admin/mysteries', idField: 'id', nameField: 'title', yamlDir: 'missions', fileType: 'mission', scalar: true },
      { field: 'characters', label: 'Characters', availableEndpoint: '/api/admin/characters', idField: 'id', nameField: 'name', yamlDir: 'characters', fileType: 'character' },
      { field: 'scenes', label: 'Scenes', availableEndpoint: '/api/admin/scenes', idField: 'id', nameField: 'name', yamlDir: 'scenes', fileType: 'scene' },
      { field: 'dialogues', label: 'Dialogues', availableEndpoint: '/api/admin/dialogues', idField: 'id', nameField: 'name', yamlDir: 'dialogues', fileType: 'dialogue' },
      { field: 'overlays', label: 'Overlays', availableEndpoint: '/api/admin/overlays', idField: 'id', nameField: 'name', yamlDir: 'overlays', fileType: 'overlay' },
      { field: 'vault_items', label: 'Vault Items', availableEndpoint: '/api/admin/vault', idField: 'id', nameField: 'title', yamlDir: 'vault', fileType: 'vault' },
    ],
  },
};

interface SectionConfig {
  field: string;
  label: string;
  availableEndpoint: string;
  idField: string;
  nameField: string;
  yamlDir: string;
  fileType: string;
  scalar?: boolean;
  arrayItemPath?: string;
}

// eslint-disable-next-line max-lines-per-function
export default function ContentLinkerPage() {
  const [tab, setTab] = useState<Tab>('scenes');
  const [entities, setEntities] = useState<ListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedData, setSelectedData] = useState<any>(null);
  const [available, setAvailable] = useState<Record<string, ListItem[]>>({});
  const [pendingOps, setPendingOps] = useState<LinkOp[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const config = TAB_CONFIG[tab];

  // Load entity list when tab changes
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setEntities([]);
      setSelectedId('');
      setSelectedData(null);
      setAvailable({});
      setPendingOps([]);
      setError(null);
      setSuccess(false);
      setLoadError(null);
      try {
        const res = await fetch(config.listEndpoint);
        const data = await res.json();
        if (active && data.success) setEntities(data.data.items || []);
        else if (active && !data.success) setLoadError(data.error || 'Failed to load items');
      } catch {
        if (active) setLoadError('Failed to load items');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tab, config.listEndpoint]);

  // Load selected entity data + available items
  useEffect(() => {
    if (!selectedId) {
      setSelectedData(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const detailRes = await fetch(`${config.listEndpoint}/${selectedId}`);
        const detailData = await detailRes.json();
        if (active && detailData.success) setSelectedData(detailData.data);

        const availResults = await Promise.all(
          config.sections.map(section =>
            fetch(section.availableEndpoint).then(r => r.json()).then(d => [section.field, d] as const)
          )
        );
        const availMap: Record<string, ListItem[]> = {};
        for (const [field, d] of availResults) {
          if (d.success) availMap[field] = d.data.items || [];
        }
        if (active) setAvailable(availMap);
      } catch {
        if (active) setError('Failed to load data');
      }
    })();
    return () => { active = false; };
  }, [selectedId, config]);

  const addPendingOp = useCallback((op: LinkOp) => {
    setPendingOps(prev => [...prev, op]);
  }, []);

  const removePendingOp = useCallback((index: number) => {
    setPendingOps(prev => prev.filter((_, i) => i !== index));
  }, []);

  const getLinkOpParams = useCallback((
    action: 'add' | 'remove' | 'set',
    section: SectionConfig,
    itemId: string
  ): LinkOp => {
    if (tab === 'scenes') {
      return {
        contentPath: `scenes/${selectedId}.yaml`,
        fieldPath: section.field,
        action,
        value: itemId,
      };
    } else if (tab === 'stories') {
      return {
        contentPath: `stories/${selectedId}.yaml`,
        fieldPath: section.field,
        action,
        value: itemId,
      };
    } else if (tab === 'missions') {
      if (section.field === 'mission_id') {
        return {
          contentPath: `overlays/${itemId}.yaml`,
          fieldPath: 'mission_id',
          action: 'set',
          value: action === 'remove' ? '' : selectedId,
        };
      } else if (section.field === 'vault_items') {
        return {
          contentPath: `vault/${itemId}.yaml`,
          fieldPath: 'mission_id',
          action: 'set',
          value: action === 'remove' ? '' : selectedId,
        };
      }
    }
    return {
      contentPath: `${section.yamlDir}/${itemId}.yaml`,
      fieldPath: section.field,
      action,
      value: itemId,
    };
  }, [tab, selectedId]);

  const handleSave = async () => {
    if (pendingOps.length === 0) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    let allOk = true;
    for (const op of pendingOps) {
      try {
        const res = await fetch('/api/admin/content/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op),
        });
        const data = await res.json();
        if (!data.success) {
          allOk = false;
          setError(`Failed: ${data.error}`);
          break;
        }
      } catch {
        allOk = false;
        setError('Link request failed');
        break;
      }
    }

    if (allOk) {
      setPendingOps([]);
      setSuccess(true);
      // Reload entity data
      if (selectedId) {
        const detailRes = await fetch(`${config.listEndpoint}/${selectedId}`);
        const detailData = await detailRes.json();
        if (detailData.success) setSelectedData(detailData.data);
      }
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  };

  const renderScalarLink = (section: SectionConfig) => {
    const currentValue = selectedData?.[section.field];
    const items = available[section.field] || [];

    return (
      <div key={section.field} style={styles.listContainer}>
        <div style={styles.listLabel}>{section.label}</div>
        <div style={styles.listItem}>
          <span style={styles.itemName}>
            {currentValue ? (
              <>Linked: {items.find((i: any) => i.id === currentValue)?.[section.nameField] || currentValue}</>
            ) : (
              <span style={styles.muted}>Not linked</span>
            )}
          </span>
          {currentValue ? (
            <button
              style={{ ...styles.button, ...styles.removeButton }}
              onClick={() => addPendingOp(getLinkOpParams('remove', section, currentValue))}
            >
              Remove
            </button>
          ) : (
            <select
              style={styles.select}
              onChange={e => {
                if (e.target.value) {
                  addPendingOp(getLinkOpParams('set', section, e.target.value));
                  e.target.value = '';
                }
              }}
            >
              <option value="">Select...</option>
              {items.map((item: any) => (
                <option key={item.id} value={item.id}>{item[section.nameField] || item.id}</option>
              ))}
            </select>
          )}
        </div>
      </div>
    );
  };

  const renderArrayLink = (section: SectionConfig) => {
    const currentArray: string[] = selectedData?.[section.field] || [];
    const items = available[section.field] || [];

    // Determine which items are linked
    const linkedIds = new Set(currentArray);
    const linked = items.filter((i: any) => linkedIds.has(i.id));
    const available_items = items.filter((i: any) => !linkedIds.has(i.id));

    return (
      <div key={section.field} style={styles.listContainer}>
        <div style={styles.listLabel}>{section.label}</div>
        {linked.length === 0 && (
          <div style={{ ...styles.listItem, color: '#555' }}>No items linked</div>
        )}
        {linked.map((item: any) => (
          <div key={item.id} style={styles.listItem}>
            <span style={styles.itemName}>{item[section.nameField] || item.id}</span>
            <button
              style={{ ...styles.button, ...styles.removeButton }}
              onClick={() => addPendingOp(getLinkOpParams('remove', section, item.id))}
            >
              Remove
            </button>
          </div>
        ))}
        {available_items.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <select
              style={styles.select}
              onChange={e => {
                if (e.target.value) {
                  addPendingOp(getLinkOpParams('add', section, e.target.value));
                  e.target.value = '';
                }
              }}
            >
              <option value="">Add item...</option>
              {available_items.map((item: any) => (
                <option key={item.id} value={item.id}>{item[section.nameField] || item.id}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>🔗 Content Linker</h1>

      <div style={styles.tabBar}>
        {(['scenes', 'missions', 'stories'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={tab === t ? styles.tabActive : styles.tab}
          >
            {TAB_CONFIG[t].label}
          </button>
        ))}
      </div>

      {loading && <p style={styles.muted}>Loading...</p>}

      {loadError && <div style={styles.errorBox}>{loadError}</div>}

      {!loading && entities.length > 0 && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionHeading}>Select {config.entityName}</h2>
            <select
              style={styles.select}
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setPendingOps([]); setSuccess(false); setError(null); }}
            >
              <option value="">Choose a {config.entityName.toLowerCase()}...</option>
              {entities.map(e => (
                <option key={e.id} value={e.id}>{e.title || e.name || e.id}</option>
              ))}
            </select>
          </div>

          {selectedData && (
            <div style={styles.section}>
              <h2 style={styles.sectionHeading}>
                Links for: {selectedData.title || selectedData.name || selectedId}
              </h2>

              {error && <div style={styles.errorBox}>{error}</div>}
              {success && <div style={styles.successBox}>✅ Links updated successfully</div>}

              {config.sections.map(section =>
                section.scalar ? renderScalarLink(section) : renderArrayLink(section)
              )}

              {pendingOps.length > 0 && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' }}>
                  <div style={{ color: '#ffaa00', marginBottom: '0.5rem' }}>
                    {pendingOps.length} pending change{pendingOps.length !== 1 ? 's' : ''}
                  </div>
                  {pendingOps.map((op, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#888' }}>{op.action}</span>
                      <span style={{ color: '#00ff00' }}>{op.fieldPath}</span>
                      <span style={{ color: '#888' }}>→</span>
                      <span style={{ color: '#fff' }}>{op.value || '(empty)'}</span>
                      <button style={{ ...styles.button, ...styles.removeButton, fontSize: '0.7rem', padding: '0.2rem 0.4rem' }} onClick={() => removePendingOp(i)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving || pendingOps.length === 0}
                style={{
                  ...styles.saveButton,
                  ...((saving || pendingOps.length === 0) ? styles.disabledButton : {}),
                }}
              >
                {saving ? '⏳ Saving...' : `💾 Save ${pendingOps.length} Change${pendingOps.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && entities.length === 0 && (
        <div style={styles.section}>
          <p style={styles.emptyState}>No {config.entityName.toLowerCase()}s found. Create some content first.</p>
        </div>
      )}
    </main>
  );
}
