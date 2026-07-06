"use client";

import { useState, useEffect } from 'react';

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: '0.5rem' },
  th: { textAlign: 'left' as const, padding: '0.4rem 0.5rem', borderBottom: '1px solid #00ff00', color: '#00ff00', fontSize: '0.85rem' },
  td: { padding: '0.4rem 0.5rem', borderBottom: '1px solid #333', fontSize: '0.85rem' },
  bar: { height: '8px', backgroundColor: '#00ff00', borderRadius: '2px', minWidth: '2px' },
  barContainer: { backgroundColor: '#333', height: '8px', borderRadius: '2px', width: '100px', display: 'inline-block', verticalAlign: 'middle', marginLeft: '0.5rem' },
  muted: { color: '#888' },
  errorBox: { background: '#ff000033', border: '1px solid #ff4444', padding: '1rem', borderRadius: '5px', marginTop: '1rem' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' },
  statCard: { textAlign: 'center' as const, padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  statValue: { fontSize: '1.5rem', color: '#00ff00', fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: '0.85rem' },
  badge: { padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 'bold' },
  activeBadge: { backgroundColor: '#00ff00', color: '#000' },
  resolvingBadge: { backgroundColor: '#ffaa00', color: '#000' },
  archivedBadge: { backgroundColor: '#888', color: '#fff' },
};

interface AnalyticsData {
  dialogueRates: Array<{
    dialogueTreeId: string;
    started: number;
    completed: number;
    completionRate: number;
  }>;
  storyBeatReach: Array<{
    storyBeat: string;
    uniquePlayers: number;
    reachPercentage: number;
  }>;
  mysteryStatus: Array<{
    status: string;
    count: number;
  }>;
  timeBlockSpend: Array<{
    eventType: string;
    contentType: string;
    totalTbSpent: number;
  }>;
  totalPlayers: number;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/admin/analytics/summary');
        const result = await res.json();
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Failed to fetch analytics');
        }
      } catch {
        setError('Failed to fetch analytics');
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>📊 Content Analytics</h1>

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading ? (
        <p style={styles.muted}>Loading analytics...</p>
      ) : data ? (
        <>
          <div style={styles.statGrid}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{data.totalPlayers}</div>
              <div style={styles.statLabel}>Total Players</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{(data.dialogueRates ?? []).length}</div>
              <div style={styles.statLabel}>Dialogues Tracked</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{(data.storyBeatReach ?? []).length}</div>
              <div style={styles.statLabel}>Story Beats Set</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{(data.mysteryStatus ?? []).reduce((s, m) => s + m.count, 0)}</div>
              <div style={styles.statLabel}>Total Mysteries</div>
            </div>
          </div>

          <div style={styles.grid}>
            {/* Dialogue Completion Rates */}
            <div style={styles.section}>
              <h2 style={styles.sectionHeading}>Dialogue Completion Rates</h2>
              {(data.dialogueRates ?? []).length === 0 ? (
                <p style={styles.muted}>No dialogue events recorded yet.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Dialogue</th>
                      <th style={styles.th}>Started</th>
                      <th style={styles.th}>Completed</th>
                      <th style={styles.th}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dialogueRates.map(item => (
                      <tr key={item.dialogueTreeId}>
                        <td style={styles.td} title={item.dialogueTreeId}>{item.dialogueTreeId.slice(0, 8)}...</td>
                        <td style={styles.td}>{item.started}</td>
                        <td style={styles.td}>{item.completed}</td>
                        <td style={styles.td}>
                          {item.completionRate}%
                          <div style={styles.barContainer}>
                            <div style={{ ...styles.bar, width: `${item.completionRate}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Story Beat Reach */}
            <div style={styles.section}>
              <h2 style={styles.sectionHeading}>Story Beat Reach</h2>
              {(data.storyBeatReach ?? []).length === 0 ? (
                <p style={styles.muted}>No story beat events recorded yet.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Story Beat</th>
                      <th style={styles.th}>Players</th>
                      <th style={styles.th}>Reach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.storyBeatReach.map(item => (
                      <tr key={item.storyBeat}>
                        <td style={styles.td}>{item.storyBeat}</td>
                        <td style={styles.td}>{item.uniquePlayers}</td>
                        <td style={styles.td}>
                          {item.reachPercentage}%
                          <div style={styles.barContainer}>
                            <div style={{ ...styles.bar, width: `${item.reachPercentage}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mystery Status Distribution */}
            <div style={styles.section}>
              <h2 style={styles.sectionHeading}>Mystery Status Distribution</h2>
              {(data.mysteryStatus ?? []).length === 0 ? (
                <p style={styles.muted}>No mysteries found.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mysteryStatus.map(item => (
                      <tr key={item.status}>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            ...(item.status === 'ACTIVE' ? styles.activeBadge
                              : item.status === 'RESOLVING' ? styles.resolvingBadge
                              : styles.archivedBadge)
                          }}>{item.status}</span>
                        </td>
                        <td style={styles.td}>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Time-Block Spend per Content Type */}
            <div style={styles.section}>
              <h2 style={styles.sectionHeading}>Time-Block Spend by Content</h2>
              {(data.timeBlockSpend ?? []).length === 0 ? (
                <p style={styles.muted}>No time-block events recorded yet.</p>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Content Type</th>
                      <th style={styles.th}>Event</th>
                      <th style={styles.th}>TB Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.timeBlockSpend.map((item, i) => (
                      <tr key={`${item.contentType}-${i}`}>
                        <td style={styles.td}>{item.contentType}</td>
                        <td style={styles.td}>{item.eventType}</td>
                        <td style={styles.td}>{item.totalTbSpent}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
