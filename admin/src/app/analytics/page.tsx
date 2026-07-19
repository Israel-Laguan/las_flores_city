'use client';

import { useState, useEffect } from 'react';
import styles from './analytics.module.css';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';

interface AnalyticsData {
  dialogueRates: Array<{ dialogueTreeId: string; started: number; completed: number; completionRate: number }>;
  storyBeatReach: Array<{ storyBeat: string; uniquePlayers: number; reachPercentage: number }>;
  mysteryStatus: Array<{ status: string; count: number }>;
  timeBlockSpend: Array<{ eventType: string; contentType: string; totalTbSpent: number }>;
  totalPlayers: number;
}

interface StoryBuilderAnalytics {
  plansCreated24h: number;
  plansCreated7d: number;
  eventsByType: Array<{ event_type: string; count: number }>;
  avgItemsPerPlan: number;
  successRate: number;
  totalTokens7d: number;
  estimatedCost7d: number;
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

function SBStatCards({ data }: { data: StoryBuilderAnalytics }) {
  const cards = [
    { value: data.plansCreated24h, label: 'Plans (24h)' },
    { value: data.plansCreated7d, label: 'Plans (7d)' },
    { value: data.avgItemsPerPlan, label: 'Avg Items/Plan' },
    { value: `${data.successRate}%`, label: 'Success Rate' },
    { value: data.totalTokens7d.toLocaleString(), label: 'Tokens (7d)' },
    { value: `${data.estimatedCost7d.toFixed(4)}`, label: 'Est. LLM Cost (7d)' },
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

function SBEventTable({ events }: { events: StoryBuilderAnalytics['eventsByType'] }) {
  if (events.length === 0) return <p className={styles.muted}>No story builder events recorded yet.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Event Type</th><th className={styles.th}>Count</th></tr></thead>
      <tbody>
        {events.map(item => (
          <tr key={item.event_type}>
            <td className={styles.td}>{item.event_type}</td>
            <td className={styles.td}>{item.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface MissionClaimStats {
  dialogueId: string;
  dialogueName: string;
  claims: number;
  uniqueUsers: number;
  completionRate: number;
  lastClaim: string;
}

function MissionClaimTable({ stats }: { stats: MissionClaimStats[] }) {
  if (stats.length === 0) return <p className={styles.muted}>No mission reward claims recorded yet.</p>;
  return (
    <table className={styles.table}>
      <thead><tr><th className={styles.th}>Dialogue</th><th className={styles.th}>Claims</th><th className={styles.th}>Unique Players</th><th className={styles.th}>Claim Rate</th><th className={styles.th}>Last Claim</th></tr></thead>
      <tbody>
        {stats.map(item => (
          <tr key={item.dialogueId}>
            <td className={styles.td}>{item.dialogueName}</td>
            <td className={styles.td}>{item.claims}</td>
            <td className={styles.td}>{item.uniqueUsers}</td>
            <td className={styles.td}>{item.completionRate}%</td>
            <td className={styles.td}>{new Date(item.lastClaim).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [sbData, setSbData] = useState<StoryBuilderAnalytics | null>(null);
  const [missionStats, setMissionStats] = useState<MissionClaimStats[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAnalytics() {
      try {
        const [summaryResult, sbResult, missionResult] = await Promise.allSettled([
          adminFetch<{ success: boolean; data?: AnalyticsData; error?: string }>('/admin/analytics/summary'),
          adminFetch<{ success: boolean; data?: StoryBuilderAnalytics; error?: string }>('/admin/analytics/story-builder'),
          adminFetch<{ success: boolean; data?: MissionClaimStats[]; error?: string }>('/admin/analytics/missions'),
        ]);
        if (cancelled) return;
        if (summaryResult.status === 'fulfilled' && summaryResult.value.success) {
          setData(summaryResult.value.data ?? null);
        } else if (summaryResult.status === 'rejected' || !summaryResult.value.success) {
          setError(summaryResult.status === 'fulfilled'
            ? summaryResult.value.error || 'Failed to fetch analytics'
            : 'Failed to fetch analytics');
        }
        if (sbResult.status === 'fulfilled' && sbResult.value.success) {
          setSbData(sbResult.value.data ?? null);
        }
        if (missionResult.status === 'fulfilled' && missionResult.value.success) {
          setMissionStats(missionResult.value.data ?? null);
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
      ) : (
        <>
          {data && (
            <>
              <StatCards data={data} />
              <div className={styles.grid}>
                <div className={styles.section}><h2 className={styles.sectionHeading}>Dialogue Completion Rates</h2><DialogueRatesTable rates={data.dialogueRates} /></div>
                <div className={styles.section}><h2 className={styles.sectionHeading}>Story Beat Reach</h2><StoryBeatReachTable reach={data.storyBeatReach} /></div>
                <div className={styles.section}><h2 className={styles.sectionHeading}>Mystery Status Distribution</h2><MysteryStatusTable status={data.mysteryStatus} /></div>
                <div className={styles.section}><h2 className={styles.sectionHeading}>Time-Block Spend by Content</h2><TimeBlockSpendTable spend={data.timeBlockSpend} /></div>
              </div>
            </>
          )}

          {sbData && (
            <>
              <h2 className={styles.sectionHeading}>Story Builder Analytics</h2>
              <SBStatCards data={sbData} />
              <div className={styles.grid}>
                <div className={styles.section}><h2 className={styles.sectionHeading}>Events by Type (7d)</h2><SBEventTable events={sbData.eventsByType} /></div>
              </div>
            </>
          )}

          {missionStats && (
            <>
              <h2 className={styles.sectionHeading}>Mission Reward Claims</h2>
              <div className={styles.grid}>
                <div className={styles.section}><MissionClaimTable stats={missionStats} /></div>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
