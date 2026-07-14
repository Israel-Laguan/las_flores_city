'use client';

import { useState, useEffect } from 'react';
import styles from './analytics.module.css';
import { cn } from '@/lib/cn';
import { adminFetch } from '@/lib/client-api';

interface AnalyticsData {
  dialogueRates: Array<{ dialogueTreeId: string; started: number; completed: number; completionRate: number }>;
  storyBeatReach: Array<{ storyBeat: string; uniquePlayers: number; reachPercentage: number }>;
  mysteryStatus: Array<{ status: string; count: number }>;
  timeBlockSpend: Array<{ eventType: string; contentType: string; totalTbSpent: number }>;
  totalPlayers: number;
}

function StatCards({ data }: { data: AnalyticsData }) {
  const totalMysteries = (data.mysteryStatus ?? []).reduce((s, m) => s + m.count, 0);
  const cards = [
    { value: data.totalPlayers, label: 'Total Players' },
    { value: (data.dialogueRates ?? []).length, label: 'Dialogues Tracked' },
    { value: (data.storyBeatReach ?? []).length, label: 'Story Beats Set' },
    { value: totalMysteries, label: 'Total Mysteries' },
  ];
  return (
    <div className={styles.statGrid}>
      {cards.map(c => (
        <div key={c.label} className={styles.statCard}>
          <div className={styles.statValue}>{c.value}</div>
          <div className={styles.statLabel}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function DialogueRatesTable({ rates }: { rates: AnalyticsData['dialogueRates'] }) {
  if (rates.length === 0) return <p className={styles.muted}>No dialogue events recorded yet.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Dialogue</th><th className={styles.th}>Started</th><th className={styles.th}>Completed</th><th className={styles.th}>Rate</th></tr></thead>
      <tbody>
        {rates.map(item => (
          <tr key={item.dialogueTreeId}>
            <td className={styles.td} title={item.dialogueTreeId}>{item.dialogueTreeId.slice(0, 8)}...</td>
            <td className={styles.td}>{item.started}</td>
            <td className={styles.td}>{item.completed}</td>
            <td className={styles.td}>{item.completionRate}%<div className={styles.barContainer}><div className={styles.bar} style={{ width: `${item.completionRate}%` }} /></div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StoryBeatReachTable({ reach }: { reach: AnalyticsData['storyBeatReach'] }) {
  if (reach.length === 0) return <p className={styles.muted}>No story beat events recorded yet.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Story Beat</th><th className={styles.th}>Players</th><th className={styles.th}>Reach</th></tr></thead>
      <tbody>
        {reach.map(item => (
          <tr key={item.storyBeat}>
            <td className={styles.td}>{item.storyBeat}</td>
            <td className={styles.td}>{item.uniquePlayers}</td>
            <td className={styles.td}>{item.reachPercentage}%<div className={styles.barContainer}><div className={styles.bar} style={{ width: `${item.reachPercentage}%` }} /></div></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MysteryStatusTable({ status }: { status: AnalyticsData['mysteryStatus'] }) {
  if (status.length === 0) return <p className={styles.muted}>No mysteries found.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Status</th><th className={styles.th}>Count</th></tr></thead>
      <tbody>
        {status.map(item => (
          <tr key={item.status}>
            <td className={styles.td}>
              <span className={cn(styles.badge, item.status === 'ACTIVE' ? styles.activeBadge : item.status === 'RESOLVING' ? styles.resolvingBadge : styles.archivedBadge)}>{item.status}</span>
            </td>
            <td className={styles.td}>{item.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TimeBlockSpendTable({ spend }: { spend: AnalyticsData['timeBlockSpend'] }) {
  if (spend.length === 0) return <p className={styles.muted}>No time-block events recorded yet.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Content Type</th><th className={styles.th}>Event</th><th className={styles.th}>TB Spent</th></tr></thead>
      <tbody>
        {spend.map((item, i) => (
          <tr key={`${item.contentType}-${i}`}>
            <td className={styles.td}>{item.contentType}</td>
            <td className={styles.td}>{item.eventType}</td>
            <td className={styles.td}>{item.totalTbSpent}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAnalytics() {
      try {
        const result = await adminFetch<{ success: boolean; data?: AnalyticsData; error?: string }>(
          '/admin/analytics/summary',
        );
        if (cancelled) return;
        if (result.success) {
          setData(result.data ?? null);
        } else {
          setError(result.error || 'Failed to fetch analytics');
        }
      } catch {
        if (cancelled) return;
        setError('Failed to fetch analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAnalytics();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.main}>
      <h1>Content Analytics</h1>
      {error && <div className={styles.errorBox}>{error}</div>}
      {loading ? (
        <p className={styles.muted}>Loading analytics...</p>
      ) : data ? (
        <>
          <StatCards data={data} />
          <div className={styles.grid}>
            <div className={styles.section}><h2 className={styles.sectionHeading}>Dialogue Completion Rates</h2><DialogueRatesTable rates={data.dialogueRates} /></div>
            <div className={styles.section}><h2 className={styles.sectionHeading}>Story Beat Reach</h2><StoryBeatReachTable reach={data.storyBeatReach} /></div>
            <div className={styles.section}><h2 className={styles.sectionHeading}>Mystery Status Distribution</h2><MysteryStatusTable status={data.mysteryStatus} /></div>
            <div className={styles.section}><h2 className={styles.sectionHeading}>Time-Block Spend by Content</h2><TimeBlockSpendTable spend={data.timeBlockSpend} /></div>
          </div>
        </>
      ) : null}
    </main>
  );
}
