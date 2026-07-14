'use client';

import { useState, useEffect } from 'react';
import styles from './home.module.css';

type Section = { title: string; items: Array<{ href: string; label: string }> };
type Action = { href: string; label: string; variant: 'primary' | 'secondary' };

const sections: Section[] = [
  {
    title: 'Content Management',
    items: [
      { href: '/characters', label: 'Characters' },
      { href: '/dialogues', label: 'Dialogues' },
      { href: '/scenes', label: 'Scenes' },
      { href: '/story-beats', label: 'Story Beats' },
      { href: '/story-arc', label: 'Story Arc' },
      { href: '/missions', label: 'Missions' },
      { href: '/stories', label: 'Stories' },
      { href: '/overlays', label: 'Overlays' },
      { href: '/locations', label: 'Locations' },
      { href: '/vault', label: 'Vault' },
      { href: '/gigs', label: 'Gigs' },
      { href: '/shop', label: 'Shop' },
      { href: '/maps', label: 'Maps' },
      { href: '/assets', label: 'Asset Generation' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/editor', label: 'YAML Editor' },
      { href: '/content-linker', label: 'Content Linker' },
      { href: '/migration', label: 'Content Migration' },
      { href: '/validation', label: 'Validate Content' },
      { href: '/quality', label: 'Quality Dashboard' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/users', label: 'User Management' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

const actions: Action[] = [
  { href: '/migration', label: 'Run Migration', variant: 'primary' },
  { href: '/validation', label: 'Validate Content', variant: 'secondary' },
  { href: '/analytics', label: 'View Analytics', variant: 'secondary' },
];

interface StatsData {
  counts: { characters: number; dialogues: number; scenes: number; overlays: number; mysteries: number };
  recentActivity: Array<{ contentType: string; filePath: string; appliedAt: string; appliedBy: string | null }>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelHeading}>{title}</h2>
      {children}
    </section>
  );
}

function QuickStats({ counts, loading }: { counts: StatsData['counts']; loading: boolean }) {
  const statCards = [
    { value: loading ? '...' : String(counts.characters), label: 'Characters' },
    { value: loading ? '...' : String(counts.dialogues), label: 'Dialogues' },
    { value: loading ? '...' : String(counts.scenes), label: 'Scenes' },
    { value: loading ? '...' : String(counts.overlays), label: 'Overlays' },
    { value: loading ? '...' : String(counts.mysteries), label: 'Mysteries' },
  ];
  return (
    <Panel title="Quick Stats">
      <div className={styles.statsGrid}>
        {statCards.map(stat => (
          <div key={stat.label} className={styles.statCard}>
            <div className={styles.statValue}>{stat.value}</div>
            <div className={styles.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RecentActivity({ activity, loading }: { activity: StatsData['recentActivity'] | undefined; loading: boolean }) {
  return (
    <Panel title="Recent Activity">
      {loading ? (
        <p className={styles.muted}>Loading...</p>
      ) : activity && activity.length > 0 ? (
        <div>
          {activity.map((a, i) => (
            <div key={i} className={styles.activityItem}>
              <div className={styles.activityType}>{a.contentType}</div>
              <div className={styles.activityFile}>{a.filePath}</div>
              <div className={styles.activityTime}>
                {new Date(a.appliedAt).toLocaleString()}
                {a.appliedBy ? ` by ${a.appliedBy}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.muted}>
          <p style={{ marginBottom: '0.5rem' }}>No recent activity</p>
          <p style={{ fontSize: '0.9rem' }}>Start migrating content to see activity here.</p>
        </div>
      )}
    </Panel>
  );
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
        // Stats failed to load
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  const counts = stats?.counts ?? { characters: 0, dialogues: 0, scenes: 0, overlays: 0, mysteries: 0 };

  return (
    <main className={styles.main}>
      <h1>Las Flores 2077 - Admin Panel</h1>
      <div className={styles.grid}>
        {sections.map(s => (
          <Panel key={s.title} title={s.title}>
            <ul className={styles.list}>
              {s.items.map(item => (
                <li key={item.href} className={styles.listItem}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
        <QuickStats counts={counts} loading={statsLoading} />
        <RecentActivity activity={stats?.recentActivity} loading={statsLoading} />
      </div>
      <div className={styles.quickActions}>
        {actions.map(a => (
          <a
            key={a.href}
            href={a.href}
            className={`${styles.action} ${a.variant === 'primary' ? styles.primaryAction : styles.secondaryAction}`}
          >
            {a.label}
          </a>
        ))}
      </div>
    </main>
  );
}
