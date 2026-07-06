"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface DialogueUsage { dialogueId: string; dialogueName: string; nodeId: string }
interface SceneUsage { sceneId: string; sceneName: string }
interface Usages { dialogueUsages: DialogueUsage[]; sceneUsages: SceneUsage[] }

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  muted: { color: '#888' },
};

function DialogueUsagesTable({ usages }: { usages: DialogueUsage[] }) {
  if (usages.length === 0) return <p style={styles.muted}>No dialogues set this beat.</p>;
  return (
    <table style={styles.table}>
      <thead><tr><th style={styles.th}>Dialogue ID</th><th style={styles.th}>Dialogue Name</th><th style={styles.th}>Node ID</th></tr></thead>
      <tbody>
        {usages.map((u, i) => (
          <tr key={i}>
            <td style={styles.td}><code style={{ color: '#aaa' }}>{u.dialogueId}</code></td>
            <td style={styles.td}>{u.dialogueName}</td>
            <td style={styles.td}><code style={{ color: '#aaa' }}>{u.nodeId}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SceneUsagesTable({ usages }: { usages: SceneUsage[] }) {
  if (usages.length === 0) return <p style={styles.muted}>No scenes require this beat.</p>;
  return (
    <table style={styles.table}>
      <thead><tr><th style={styles.th}>Scene ID</th><th style={styles.th}>Scene Name</th></tr></thead>
      <tbody>
        {usages.map((u, i) => (
          <tr key={i}>
            <td style={styles.td}><code style={{ color: '#aaa' }}>{u.sceneId}</code></td>
            <td style={styles.td}>{u.sceneName}</td>
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
        const res = await fetch(`/api/admin/story-beats/${slug}/usages`, { signal: controller.signal });
        const data = await res.json();
        if (data.success) {
          setUsages(data.data);
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
    <main style={styles.main}>
      <a href="/story-beats" style={{ color: '#00ff00' }}>← Back to Beat Registry</a>
      <h1 style={{ ...styles.heading, marginTop: '1rem' }}>Beat: <code>{slug}</code></h1>
      {loading && <p style={styles.muted}>Loading usages...</p>}
      {error && <div style={styles.errorBox}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</pre></div>}
      {usages && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionHeading}>Dialogues that set this beat</h2>
            <DialogueUsagesTable usages={usages.dialogueUsages} />
          </div>
          <div style={styles.section}>
            <h2 style={styles.sectionHeading}>Scenes that require this beat</h2>
            <SceneUsagesTable usages={usages.sceneUsages} />
          </div>
        </>
      )}
    </main>
  );
}
