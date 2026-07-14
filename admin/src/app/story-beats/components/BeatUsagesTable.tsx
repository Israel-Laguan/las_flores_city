'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/client-api';
import styles from './BeatUsagesTable.module.css';

interface DialogueUsage { dialogueId: string; dialogueName: string; nodeId: string }
interface SceneUsage { sceneId: string; sceneName: string }
interface Usages { dialogueUsages: DialogueUsage[]; sceneUsages: SceneUsage[] }

function DialogueUsagesTable({ usages }: { usages: DialogueUsage[] }) {
  if (usages.length === 0) return <p className={styles.muted}>No dialogues set this beat.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Dialogue ID</th><th className={styles.th}>Dialogue Name</th><th className={styles.th}>Node ID</th></tr></thead>
      <tbody>
        {usages.map((u, i) => (
          <tr key={i}>
            <td className={styles.td}><code className={styles.code}>{u.dialogueId}</code></td>
            <td className={styles.td}>{u.dialogueName}</td>
            <td className={styles.td}><code className={styles.code}>{u.nodeId}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SceneUsagesTable({ usages }: { usages: SceneUsage[] }) {
  if (usages.length === 0) return <p className={styles.muted}>No scenes require this beat.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Scene ID</th><th className={styles.th}>Scene Name</th></tr></thead>
      <tbody>
        {usages.map((u, i) => (
          <tr key={i}>
            <td className={styles.td}><code className={styles.code}>{u.sceneId}</code></td>
            <td className={styles.td}>{u.sceneName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BeatDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [usages, setUsages] = useState<Usages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    const fetchUsages = async () => {
      try {
        const data = await adminFetch<{ success: boolean; data?: Usages; error?: string }>(
          `/admin/story-beats/${slug}/usages`,
          { signal: controller.signal },
        );
        if (data.success) {
          setUsages(data.data ?? null);
        } else {
          setError(data.error || 'Failed to fetch usages');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Failed to fetch beat usages');
      } finally {
        setLoading(false);
      }
    };
    fetchUsages();
    return () => { controller.abort(); };
  }, [slug]);

  return (
    <main className={styles.main}>
      <Link href="/story-beats" className={styles.backLink}>&larr; Back to Beat Registry</Link>
      <h1 className={styles.heading}>Beat: <code>{slug}</code></h1>
      {loading && <p className={styles.muted}>Loading usages...</p>}
      {error && <div className={styles.errorBox}><pre className={styles.errorPre}>{error}</pre></div>}
      {usages && (
        <>
          <div className={styles.section}>
            <h2 className={styles.sectionHeading}>Dialogues that set this beat</h2>
            <DialogueUsagesTable usages={usages.dialogueUsages} />
          </div>
          <div className={styles.section}>
            <h2 className={styles.sectionHeading}>Scenes that require this beat</h2>
            <SceneUsagesTable usages={usages.sceneUsages} />
          </div>
        </>
      )}
    </main>
  );
}
