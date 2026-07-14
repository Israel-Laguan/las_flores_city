'use client';

import { useState } from 'react';
import styles from './content-linker.module.css';
import { cn } from '@las-flores/ui';
import ScalarLink from './components/ScalarLink';
import ArrayLink from './components/ArrayLink';
import { ListItem, LinkOp, SectionConfig } from './types';
import { useContentLinker } from './hooks/useContentLinker';

type Tab = 'scenes' | 'missions' | 'stories';

const TAB_CONFIG: Record<Tab, { label: string; listEndpoint: string; entityName: string; sections: SectionConfig[] }> = {
  scenes: {
    label: 'Scenes',
    listEndpoint: '/admin/scenes',
    entityName: 'Scene',
    sections: [
      { field: 'available_dialogues', label: 'Linked Dialogues', availableEndpoint: '/admin/dialogues', idField: 'id', nameField: 'name', yamlDir: 'dialogues', fileType: 'dialogue' },
    ],
  },
  missions: {
    label: 'Missions',
    listEndpoint: '/admin/mysteries',
    entityName: 'Mission',
    sections: [
      { field: 'mission_id', label: 'Linked Overlay (mission_id)', availableEndpoint: '/admin/overlays', idField: 'id', nameField: 'name', yamlDir: 'overlays', fileType: 'overlay', scalar: true },
      { field: 'vault_items', label: 'Vault Items (mission_id)', availableEndpoint: '/admin/vault', idField: 'id', nameField: 'title', yamlDir: 'vault', fileType: 'vault', scalar: false, arrayItemPath: 'mission_id' },
    ],
  },
  stories: {
    label: 'Stories',
    listEndpoint: '/admin/stories',
    entityName: 'Story',
    sections: [
      { field: 'mission_id', label: 'Linked Mission', availableEndpoint: '/admin/mysteries', idField: 'id', nameField: 'title', yamlDir: 'missions', fileType: 'mission', scalar: true },
      { field: 'characters', label: 'Characters', availableEndpoint: '/admin/characters', idField: 'id', nameField: 'name', yamlDir: 'characters', fileType: 'character' },
      { field: 'scenes', label: 'Scenes', availableEndpoint: '/admin/scenes', idField: 'id', nameField: 'name', yamlDir: 'scenes', fileType: 'scene' },
      { field: 'dialogues', label: 'Dialogues', availableEndpoint: '/admin/dialogues', idField: 'id', nameField: 'name', yamlDir: 'dialogues', fileType: 'dialogue' },
      { field: 'overlays', label: 'Overlays', availableEndpoint: '/admin/overlays', idField: 'id', nameField: 'name', yamlDir: 'overlays', fileType: 'overlay' },
      { field: 'vault_items', label: 'Vault Items', availableEndpoint: '/admin/vault', idField: 'id', nameField: 'title', yamlDir: 'vault', fileType: 'vault' },
    ],
  },
};

function PendingOpsList({ ops, onRemove }: { ops: LinkOp[]; onRemove: (index: number) => void }) {
  return (
    <div className={styles.pendingOps}>
      <div className={styles.pendingCount}>
        {ops.length} pending change{ops.length !== 1 ? 's' : ''}
      </div>
      {ops.map((op, i) => (
        <div key={i} className={styles.pendingOp}>
          <span className={styles.opAction}>{op.action}</span>
          <span className={styles.opField}>{op.fieldPath}</span>
          <span className={styles.opArrow}>→</span>
          <span className={styles.opValue}>{op.value || '(empty)'}</span>
          <button className={cn(styles.removeButton, styles.smallButton)} onClick={() => onRemove(i)}>&times;</button>
        </div>
      ))}
    </div>
  );
}

function EntitySelector({ entities, entityName, selectedId, onChange }: {
  entities: ListItem[]; entityName: string; selectedId: string; onChange: (id: string) => void;
}) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Select {entityName}</h2>
      <select
        className={styles.select}
        value={selectedId}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Choose a {entityName.toLowerCase()}...</option>
        {entities.map(e => (
          <option key={e.id} value={e.id}>{e.title || e.name || e.id}</option>
        ))}
      </select>
    </div>
  );
}

function LinksSection({ config, selectedData, available, onAddPendingOp, onGetLinkOpParams }: {
  config: { sections: SectionConfig[] };
  selectedData: Record<string, unknown> | null;
  available: Record<string, ListItem[]>;
  onAddPendingOp: (op: LinkOp) => void;
  onGetLinkOpParams: (action: 'add' | 'remove' | 'set', section: SectionConfig, value: string) => LinkOp;
}) {
  return (
    <>
      {config.sections.map(section =>
        section.scalar
          ? <ScalarLink key={section.field} section={section} selectedData={selectedData} available={available} onAddPendingOp={onAddPendingOp} onGetLinkOpParams={onGetLinkOpParams} />
          : <ArrayLink key={section.field} section={section} selectedData={selectedData} available={available} onAddPendingOp={onAddPendingOp} onGetLinkOpParams={onGetLinkOpParams} />
      )}
    </>
  );
}

export default function ContentLinkerPage() {
  const [tab, setTab] = useState<Tab>('scenes');
  const config = TAB_CONFIG[tab];
  const linker = useContentLinker(config);

  const getLinkOpParams = (
    action: 'add' | 'remove' | 'set',
    section: SectionConfig,
    itemId: string
  ): LinkOp => {
    if (tab === 'scenes') {
      return { contentPath: `scenes/${linker.selectedId}.yaml`, fieldPath: section.field, action, value: itemId };
    } else if (tab === 'stories') {
      return { contentPath: `stories/${linker.selectedId}.yaml`, fieldPath: section.field, action, value: itemId };
    } else if (tab === 'missions') {
      if (section.field === 'mission_id') {
        return { contentPath: `overlays/${itemId}.yaml`, fieldPath: 'mission_id', action: 'set', value: action === 'remove' ? '' : linker.selectedId };
      } else if (section.field === 'vault_items') {
        return { contentPath: `vault/${itemId}.yaml`, fieldPath: 'mission_id', action: 'set', value: action === 'remove' ? '' : linker.selectedId };
      }
    }
    return { contentPath: `${section.yamlDir}/${itemId}.yaml`, fieldPath: section.field, action, value: itemId };
  };


  return (
    <main className={styles.main}>
      <h1>Content Linker</h1>

      <div className={styles.tabBar}>
        {(['scenes', 'missions', 'stories'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn(styles.tab, tab === t && styles.tabActive)}>
            {TAB_CONFIG[t].label}
          </button>
        ))}
      </div>

      {linker.loading && <p className={styles.muted}>Loading...</p>}
      {linker.loadError && <div className={styles.errorBox}>{linker.loadError}</div>}

      {!linker.loading && linker.entities.length > 0 && (
        <>
          <EntitySelector entities={linker.entities} entityName={config.entityName} selectedId={linker.selectedId} onChange={linker.selectEntity} />

          {linker.selectedData && (
            <div className={styles.section}>
              <h2 className={styles.sectionHeading}>Links for: {linker.selectedData.title || linker.selectedData.name || linker.selectedId}</h2>

              {linker.error && <div className={styles.errorBox}>{linker.error}</div>}
              {linker.success && <div className={styles.successBox}>Links updated successfully</div>}

              <LinksSection config={config} selectedData={linker.selectedData} available={linker.available} onAddPendingOp={linker.addPendingOp} onGetLinkOpParams={getLinkOpParams} />

              {linker.pendingOps.length > 0 && <PendingOpsList ops={linker.pendingOps} onRemove={linker.removePendingOp} />}

              <button
                onClick={() => linker.handleSave(config)}
                disabled={linker.saving || linker.pendingOps.length === 0}
                className={cn(styles.saveButton, (linker.saving || linker.pendingOps.length === 0) && styles.disabledButton)}
              >
                {linker.saving ? 'Saving...' : `Save ${linker.pendingOps.length} Change${linker.pendingOps.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </>
      )}

      {!linker.loading && linker.entities.length === 0 && (
        <div className={styles.section}>
          <p className={styles.emptyState}>No {config.entityName.toLowerCase()}s found. Create some content first.</p>
        </div>
      )}
    </main>
  );
}