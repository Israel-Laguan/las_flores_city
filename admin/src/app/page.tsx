"use client";

import { useState, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

type Section = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

type Action = { href: string; label: string; variant: 'primary' | 'secondary' };

const sections: Section[] = [
  {
    title: 'Content Management',
    items: [
      { href: '/characters', label: '👤 Characters' },
      { href: '/dialogues', label: '💬 Dialogues' },
      { href: '/scenes', label: '🏙️ Scenes' },
      { href: '/story-beats', label: '📖 Story Beats' },
      { href: '/mysteries', label: '🔍 Mysteries' },
      { href: '/overlays', label: '🔄 Overlays' },
      { href: '/locations', label: '📍 Locations' },
      { href: '/vault', label: '🔐 Vault' },
      { href: '/gigs', label: '💼 Gigs' },
      { href: '/shop', label: '🛒 Shop' },
      { href: '/maps', label: '🗺️ Maps' },
      { href: '/assets', label: '🎨 Asset Generation' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/migration', label: '🚀 Content Migration' },
      { href: '/validation', label: '✅ Validate Content' },
      { href: '/analytics', label: '📊 Analytics' },
      { href: '/users', label: '👥 User Management' },
      { href: '/settings', label: '⚙️ Settings' },
    ],
  },
];

const actions: Action[] = [
  { href: '/migration', label: '🚀 Run Migration', variant: 'primary' },
  { href: '/validation', label: '✅ Validate Content', variant: 'secondary' },
  { href: '/analytics', label: '📊 View Analytics', variant: 'secondary' },
];

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' },
  panel: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' },
  panelHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  list: { listStyle: 'none', padding: 0 },
  listItem: { marginBottom: '0.5rem' },
  link: { color: '#00ff00', textDecoration: 'none' },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  statCard: { textAlign: 'center', padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  statValue: { fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: '0.9rem' },
  muted: { color: '#888' },
  quickActions: { marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' },
  action: { padding: '0.75rem 1.5rem', textDecoration: 'none', borderRadius: '5px', fontWeight: 'bold', fontFamily: 'monospace' },
  primaryAction: { backgroundColor: '#00ff00', color: '#000' },
  secondaryAction: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
  activityItem: { marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #333' },
  activityType: { fontSize: '0.8rem', color: '#00ff00' },
  activityFile: { fontSize: '0.85rem', color: '#aaa' },
  activityTime: { fontSize: '0.75rem', color: '#666' },
} satisfies Record<string, CSSProperties>;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={styles.panel}>
      <h2 style={styles.panelHeading}>{title}</h2>
      {children}
    </section>
  );
}

interface StatsData {
  counts: {
    characters: number;
    dialogues: number;
    scenes: number;
    overlays: number;
    mysteries: number;
  };
  recentActivity: Array<{
    contentType: string;
    filePath: string;
    appliedAt: string;
    appliedBy: string | null;
  }>;
}

export default function Home() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (data.success) {
          setStats(data.data);
        }
      } catch {
        // Stats failed to load — show defaults
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  const counts = stats?.counts ?? { characters: 0, dialogues: 0, scenes: 0, overlays: 0, mysteries: 0 };
  const statCards = [
    { value: statsLoading ? '...' : String(counts.characters), label: 'Characters' },
    { value: statsLoading ? '...' : String(counts.dialogues), label: 'Dialogues' },
    { value: statsLoading ? '...' : String(counts.scenes), label: 'Scenes' },
    { value: statsLoading ? '...' : String(counts.overlays), label: 'Overlays' },
    { value: statsLoading ? '...' : String(counts.mysteries), label: 'Mysteries' },
  ];

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>Las Flores 2077 - Admin Panel</h1>

      <div style={styles.grid}>
        {sections.map((section) => (
          <Panel key={section.title} title={section.title}>
            <ul style={styles.list}>
              {section.items.map((item) => (
                <li key={item.href} style={styles.listItem}>
                  <a href={item.href} style={styles.link}>{item.label}</a>
                </li>
              ))}
            </ul>
          </Panel>
        ))}

        <Panel title="Quick Stats">
          <div style={styles.statsGrid}>
            {statCards.map((stat) => (
              <div key={stat.label} style={styles.statCard}>
                <div style={styles.statValue}>{stat.value}</div>
                <div style={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent Activity">
          {statsLoading ? (
            <p style={styles.muted}>Loading...</p>
          ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div>
              {stats.recentActivity.map((activity, i) => (
                <div key={i} style={styles.activityItem}>
                  <div style={styles.activityType}>{activity.contentType}</div>
                  <div style={styles.activityFile}>{activity.filePath}</div>
                  <div style={styles.activityTime}>
                    {new Date(activity.appliedAt).toLocaleString()}
                    {activity.appliedBy ? ` by ${activity.appliedBy}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.muted}>
              <p style={{ marginBottom: '0.5rem' }}>No recent activity</p>
              <p style={{ fontSize: '0.9rem' }}>Start migrating content to see activity here.</p>
            </div>
          )}
        </Panel>
      </div>

      <div style={styles.quickActions}>
        {actions.map((action) => (
          <a
            key={action.href}
            href={action.href}
            style={{ ...styles.action, ...(action.variant === 'primary' ? styles.primaryAction : styles.secondaryAction) }}
          >
            {action.label}
          </a>
        ))}
      </div>
    </main>
  );
}
