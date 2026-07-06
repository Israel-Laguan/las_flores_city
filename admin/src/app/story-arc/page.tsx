"use client";

import { useState, useEffect } from 'react';
import { adminStyles as styles } from '@/lib/adminStyles';

interface DialogueRef {
  id: string;
  name: string;
  nodeId: string;
}

interface SceneRef {
  id: string;
  name: string;
}

interface BeatArc {
  slug: string;
  label: string;
  order: number;
  description: string;
  setByDialogues: DialogueRef[];
  requiredByScenes: SceneRef[];
  isReachable: boolean;
  isServerSide: boolean;
}

interface Coverage {
  totalBeats: number;
  reachableBeats: number;
  unreachableBeats: number;
  serverSideBeats: number;
  dialoguesSettingBeat: number;
  scenesRequiringBeat: number;
}

interface ArcResponse {
  success: boolean;
  data: { beats: BeatArc[]; coverage: Coverage };
}

function CoverageBar({ coverage }: { coverage: Coverage }) {
  const pct = coverage.totalBeats > 0
    ? Math.round((coverage.reachableBeats / coverage.totalBeats) * 100)
    : 0;

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionHeading}>Coverage</h2>
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#00ff00' }}>{coverage.reachableBeats}/{coverage.totalBeats} beats reachable ({pct}%)</span>
        <span style={{ color: '#ff4444' }}>{coverage.unreachableBeats} unreachable</span>
        <span style={{ color: '#888' }}>{coverage.serverSideBeats} server-side</span>
      </div>
      <div style={{ height: '6px', backgroundColor: '#333', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          backgroundColor: pct > 80 ? '#00ff00' : pct > 50 ? '#ffaa00' : '#ff4444',
          transition: 'width 0.3s',
        }} />
      </div>
      <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.25rem' }}>
        {coverage.dialoguesSettingBeat} dialogues set beats | {coverage.scenesRequiringBeat} scenes gate on beats
      </div>
    </div>
  );
}

function BeatCard({ beat, isLast }: { beat: BeatArc; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = beat.isReachable ? '#00ff00' : '#ff4444';
  const bgColor = beat.isReachable ? '#00ff0008' : '#ff444408';

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '5px',
          padding: '1rem',
          cursor: 'pointer',
          fontFamily: 'monospace',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ color: '#00ff00', fontWeight: 'bold' }}>[{beat.order}] {beat.label}</span>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            {beat.isServerSide && (
              <span style={{ ...styles.badge, ...styles.infoBadge }}>Server-side</span>
            )}
            {beat.isReachable ? (
              <span style={{ ...styles.badge, ...styles.successBadge }}>Reachable</span>
            ) : (
              <span style={{ ...styles.badge, ...styles.dangerBadge }}>Unreachable</span>
            )}
          </span>
        </div>
        <div style={{ color: '#888', fontSize: '0.85rem' }}>{beat.description}</div>
        <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          {expanded ? '▼ Collapse' : '▶ Expand'} — {beat.setByDialogues.length} dialogues, {beat.requiredByScenes.length} scenes
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0d0d1a', borderLeft: `3px solid ${borderColor}`, borderBottom: `1px solid ${borderColor}`, borderRight: `1px solid ${borderColor}`, borderBottomLeftRadius: '5px', borderBottomRightRadius: '5px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: '#00ff00', fontWeight: 'bold' }}>Set by dialogues:</span>
            {beat.setByDialogues.length === 0 ? (
              <span style={{ color: '#ff4444', marginLeft: '0.5rem' }}>None</span>
            ) : (
              <ul style={{ margin: '0.25rem 0 0 1.5rem', padding: 0 }}>
                {beat.setByDialogues.map(d => (
                  <li key={`${d.id}-${d.nodeId}`} style={{ color: '#aaa', marginBottom: '0.25rem' }}>
                    {d.name} <span style={{ color: '#666' }}>(node: {d.nodeId})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <span style={{ color: '#00ff00', fontWeight: 'bold' }}>Required by scenes:</span>
            {beat.requiredByScenes.length === 0 ? (
              <span style={{ color: '#888', marginLeft: '0.5rem' }}>None</span>
            ) : (
              <ul style={{ margin: '0.25rem 0 0 1.5rem', padding: 0 }}>
                {beat.requiredByScenes.map(s => (
                  <li key={s.id} style={{ color: '#aaa', marginBottom: '0.25rem' }}>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!isLast && (
        <div style={{ textAlign: 'center', color: '#00ff00', fontSize: '1.2rem', padding: '0.25rem 0' }}>
          ↓
        </div>
      )}
    </div>
  );
}

export default function StoryArcPage() {
  const [beats, setBeats] = useState<BeatArc[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/story-arc');
      const data: ArcResponse = await res.json();
      if (data.success) {
        setBeats(data.data.beats);
        setCoverage(data.data.coverage);
      } else {
        setError('Failed to load story arc');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <main style={styles.main}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={styles.heading}>📊 Story Arc</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{ ...styles.button, ...(loading ? styles.disabledButton : styles.secondaryButton) }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {coverage && <CoverageBar coverage={coverage} />}

      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>Timeline</h2>
        {loading ? (
          <p style={styles.muted}>Loading beats...</p>
        ) : beats.length === 0 ? (
          <p style={styles.muted}>No story beats found. Run story_beats.yaml migration first.</p>
        ) : (
          <div>
            {beats.map((beat, i) => (
              <BeatCard key={beat.slug} beat={beat} isLast={i === beats.length - 1} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
