"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface DialogueUsage {
  dialogueId: string;
  dialogueName: string;
  nodeId: string;
}

interface SceneUsage {
  sceneId: string;
  sceneName: string;
}

interface Usages {
  dialogueUsages: DialogueUsage[];
  sceneUsages: SceneUsage[];
}

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  button: {
    padding: '0.75rem 1.5rem',
    borderRadius: '5px',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    cursor: 'pointer',
    border: 'none',
    fontSize: '1rem',
  },
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
  secondaryButton: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  dangerButton: { backgroundColor: '#ff4444', color: '#000' },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '1rem' },
  th: { textAlign: 'left' as const, padding: '0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00' },
  td: { padding: '0.5rem', borderBottom: '1px solid #333' },
  badge: { padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.8rem', fontWeight: 'bold' },
  successBadge: { backgroundColor: '#00ff00', color: '#000' },
  errorBadge: { backgroundColor: '#ff4444', color: '#fff' },
  warningBadge: { backgroundColor: '#ffaa00', color: '#000' },
  infoBadge: { backgroundColor: '#0066ff', color: '#fff' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  successBox: { background: '#00ff0033', border: '1px solid #00ff00', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' },
  summaryCard: { textAlign: 'center' as const, padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  summaryValue: { fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' },
  summaryLabel: { color: '#888', fontSize: '0.9rem' },
  muted: { color: '#888' },
  spinner: { display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid #00ff00', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '0.5rem' },
};

export default function BeatDetailPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [usages, setUsages] = useState<Usages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const fetchUsages = async () => {
      try {
        const res = await fetch(`/api/admin/story-beats/${slug}/usages`);
        const data = await res.json();
        if (data.success) {
          setUsages(data.data);
        } else {
          setError(data.error || 'Failed to fetch usages');
        }
      } catch {
        setError('Failed to fetch beat usages');
      } finally {
        setLoading(false);
      }
    };
    fetchUsages();
  }, [slug]);

  return (
    <main style={styles.main}>
      <a href="/story-beats" style={{ color: '#00ff00' }}>← Back to Beat Registry</a>

      <h1 style={{ ...styles.heading, marginTop: '1rem' }}>
        Beat: <code>{slug}</code>
      </h1>

      {loading && (
        <p style={styles.muted}>Loading usages...</p>
      )}

      {error && (
        <div style={styles.errorBox}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</pre>
        </div>
      )}

      {usages && (
        <>
          {/* Dialogue Usages */}
          <div style={styles.section}>
            <h2 style={styles.sectionHeading}>Dialogues that set this beat</h2>
            {usages.dialogueUsages.length > 0 ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Dialogue ID</th>
                    <th style={styles.th}>Dialogue Name</th>
                    <th style={styles.th}>Node ID</th>
                  </tr>
                </thead>
                <tbody>
                  {usages.dialogueUsages.map((u, i) => (
                    <tr key={i}>
                      <td style={styles.td}><code style={{ color: '#aaa' }}>{u.dialogueId}</code></td>
                      <td style={styles.td}>{u.dialogueName}</td>
                      <td style={styles.td}><code style={{ color: '#aaa' }}>{u.nodeId}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={styles.muted}>No dialogues set this beat.</p>
            )}
          </div>

          {/* Scene Usages */}
          <div style={styles.section}>
            <h2 style={styles.sectionHeading}>Scenes that require this beat</h2>
            {usages.sceneUsages.length > 0 ? (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Scene ID</th>
                    <th style={styles.th}>Scene Name</th>
                  </tr>
                </thead>
                <tbody>
                  {usages.sceneUsages.map((u, i) => (
                    <tr key={i}>
                      <td style={styles.td}><code style={{ color: '#aaa' }}>{u.sceneId}</code></td>
                      <td style={styles.td}>{u.sceneName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={styles.muted}>No scenes require this beat.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
