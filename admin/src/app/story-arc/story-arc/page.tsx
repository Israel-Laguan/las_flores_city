'use client';

import { useState, useEffect } from 'react';
import styles from './story-arc.module.css';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';

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
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Coverage</h2>
      <div className={styles.coverageStats}>
        <span className={styles.successText}>{coverage.reachableBeats}/{coverage.totalBeats} beats reachable ({pct}%)</span>
        <span className={styles.errorText}>{coverage.unreachableBeats} unreachable</span>
        <span className={styles.muted}>{coverage.serverSideBeats} server-side</span>
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 80 ? 'var(--accent)' : pct > 50 ? '#ffaa00' : 'var(--danger)',
          }}
        />
      </div>
      <div className={styles.coverageMeta}>
        {coverage.dialoguesSettingBeat} dialogues set beats | {coverage.scenesRequiringBeat} scenes gate on beats
      </div>
    </div>
  );
}

function BeatCard({ beat, isLast }: { beat: BeatArc; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = beat.isReachable ? 'var(--accent)' : 'var(--danger)';
  const bgColor = beat.isReachable ? 'rgba(0, 255, 0, 0.03)' : 'rgba(255, 68, 68, 0.03)';

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={styles.beatButton}
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
        }}
      >
        <div className={styles.beatHeader}>
          <span className={styles.beatTitle}>[{beat.order}] {beat.label}</span>
          <span className={styles.beatBadges}>
            {beat.isServerSide && (
              <span className={cn(styles.badge, styles.infoBadge)}>Server-side</span>
            )}
            {beat.isReachable ? (
              <span className={cn(styles.badge, styles.successBadge)}>Reachable</span>
            ) : (
              <span className={cn(styles.badge, styles.dangerBadge)}>Unreachable</span>
            )}
          </span>
        </div>
        <div className={styles.beatDescription}>{beat.description}</div>
        <div className={styles.beatMeta}>
          {expanded ? '▼ Collapse' : '▶ Expand'} — {beat.setByDialogues.length} dialogues, {beat.requiredByScenes.length} scenes
        </div>
      </button>

      {expanded && (
        <div className={styles.beatExpanded} style={{ borderLeftColor: borderColor, borderBottomColor: borderColor, borderRightColor: borderColor }}>
          <div className={styles.expandedSection}>
            <span className={styles.expandedLabel}>Set by dialogues:</span>
            {beat.setByDialogues.length === 0 ? (
              <span className={styles.errorText}>None</span>
            ) : (
              <ul className={styles.expandedList}>
                {beat.setByDialogues.map(d => (
                  <li key={`${d.id}-${d.nodeId}`} className={styles.expandedItem}>
                    {d.name} <span className={styles.nodeId}>(node: {d.nodeId})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <span className={styles.expandedLabel}>Required by scenes:</span>
            {beat.requiredByScenes.length === 0 ? (
              <span className={styles.muted}>None</span>
            ) : (
              <ul className={styles.expandedList}>
                {beat.requiredByScenes.map(s => (
                  <li key={s.id} className={styles.expandedItem}>
                    {s.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!isLast && (
        <div className={styles.arrow}>↓</div>
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
      const data: ArcResponse = await adminFetch<ArcResponse>('/admin/story-arc');
      if (data.success && data.data) {
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
    <main className={styles.main}>
      <div className={styles.header}>
        <h1>Story Arc</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          className={cn(styles.button, loading ? styles.disabledButton : styles.secondaryButton)}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {coverage && <CoverageBar coverage={coverage} />}

      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>Timeline</h2>
        {loading ? (
          <p className={styles.muted}>Loading beats...</p>
        ) : beats.length === 0 ? (
          <p className={styles.muted}>No story beats found. Run story_beats.yaml migration first.</p>
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
