'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/client-api';
import Badge from '@/components/Badge';
import { useBreadcrumbLabel } from '@/components/BreadcrumbContext';
import EntityDetailView from '@/components/entity/EntityDetailView';
import { CHARACTER_VIEW_FIELDS } from '../field-definitions';
import styles from './character-detail.module.css';

interface CharacterRecord {
  id: string;
  name: string;
  title?: string;
  description?: string;
  portrait_urls?: Array<Record<string, unknown>> | null;
  available_dialogues?: string[] | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

function LinkedDialogues({ dialogueIds, dialoguesMap }: { dialogueIds: string[]; dialoguesMap: Record<string, string> }) {
  if (dialogueIds.length === 0) {
    return <p className={styles.muted}>No dialogues linked</p>;
  }
  return (
    <ul className={styles.dialogueList}>
      {dialogueIds.map((dId) => (
        <li key={dId}>
          <Link href={`/dialogues/${dId}`} target="_blank" className={styles.dialogueLink}>
            {dialoguesMap[dId] || dId}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function CharacterDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<CharacterRecord | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Fetch dialogues list to resolve UUIDs → names
  const [dialoguesMap, setDialoguesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    // Reset state for the new route — clears stale breadcrumb label
    setRecord(null);
    setLoading(true);
    setError(null);
    setNotFound(false);

    async function fetchRecord() {
      try {
        const data = await adminFetch<{ success: boolean; data?: CharacterRecord; error?: string }>(
          `/admin/characters/${id}`,
        );
        if (cancelled) return;
        if (data.success && data.data) {
          setRecord(data.data);
          setLoadedId(id);
        } else {
          setError(data.error || 'Failed to fetch character');
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.status === 404) {
          setNotFound(true);
        } else {
          setError('Failed to fetch character');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRecord();
    return () => { cancelled = true; };
  }, [id]);

  // Build a dialogue-id → name lookup once
  useEffect(() => {
    if (!record?.available_dialogues?.length) return;
    adminFetch<{ success: boolean; data?: { items: Array<{ id: string; name: string }> } }>(
      '/admin/dialogues?pageSize=200',
    ).then((data) => {
      if (data.success && data.data?.items) {
        const map: Record<string, string> = {};
        for (const d of data.data.items) {
          map[d.id] = d.name;
        }
        setDialoguesMap(map);
      }
    }).catch((err) => {
      console.error('[CharacterDetailPage] Failed to load dialogue names:', err);
    });
  }, [record?.available_dialogues]);

  useBreadcrumbLabel(id, loadedId === id ? record?.name ?? null : null);

  if (loading || loadedId !== id) {
    return (
      <main className={styles.main}>
        <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
        <p className={styles.muted}>Loading...</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className={styles.main}>
        <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
        <p>Not found.</p>
      </main>
    );
  }

  if (error || !record) {
    return (
      <main className={styles.main}>
        <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
        <div className={styles.errorBox}>{error || 'Character not found'}</div>
      </main>
    );
  }

  const hasPortraits = Array.isArray(record.portrait_urls) && record.portrait_urls.length > 0;
  const portraitStatus = hasPortraits ? 'ready' : 'missing';
  const dialogueIds: string[] = Array.isArray(record.available_dialogues) ? record.available_dialogues : [];
  const linkingUrl = `/content-linker?tab=characters&id=${encodeURIComponent(id)}`;

  return (
    <main className={styles.main}>
      <Link href="/characters" className={styles.backLink}>&larr; Back to Characters</Link>
      <div className={styles.header}>
        <h1 className={styles.title}>Character: {record.name}</h1>
        <div className={styles.headerActions}>
          <Badge variant={portraitStatus === 'ready' ? 'success' : 'warning'}>{portraitStatus}</Badge>
          <Link href={`/characters/${id}/edit`} className="btn btn--primary">Edit</Link>
        </div>
      </div>
      <EntityDetailView fields={CHARACTER_VIEW_FIELDS} record={record as unknown} />

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Linked Dialogues</h2>
          <Link href={linkingUrl} target="_blank" className="btn btn--secondary btn--small">
            Manage Dialogues
          </Link>
        </div>
        <LinkedDialogues dialogueIds={dialogueIds} dialoguesMap={dialoguesMap} />
      </div>
    </main>
  );
}

