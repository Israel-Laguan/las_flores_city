'use client';

import { useState, useEffect } from 'react';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import styles from './home.module.css';

interface StatsData {
  counts: { characters: number; dialogues: number; scenes: number; overlays: number; mysteries: number };
  recentActivity: Array<{ contentType: string; filePath: string; appliedAt: string; appliedBy: string | null }>;
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
    <div className={styles.statsGrid}>
      {statCards.map(stat => (
        <div key={stat.label} className={styles.statCard}>
          <div className={styles.statValue}>{stat.value}</div>
          <div className={styles.statLabel}>{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function RecentActivity({ activity, loading }: { activity: StatsData['recentActivity'] | undefined; loading: boolean }) {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelHeading}>Recent Activity</h2>
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
          <p className={styles.activityNote}>No recent activity</p>
          <p className={styles.activityHint}>Start migrating content to see activity here.</p>
        </div>
      )}
    </div>
  );
}

const actions = [
  { href: '/migration', label: 'Run Migration', variant: 'primary' as const },
  { href: '/validation', label: 'Validate Content', variant: 'secondary' as const },
  { href: '/analytics', label: 'View Analytics', variant: 'secondary' as const },
];

export default function Home() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await adminFetch<{ success: boolean; data?: StatsData }>(
          '/admin/stats',
        );
        if (data.success) {
          setStats(data.data ?? null);
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
      <h1>Dashboard</h1>
      <QuickStats counts={counts} loading={statsLoading} />
      <div className={styles.grid}>
        <RecentActivity activity={stats?.recentActivity} loading={statsLoading} />
      </div>
      <div className={styles.quickActions}>
        {actions.map(a => (
          <a
            key={a.href}
            href={a.href}
            className={cn(styles.action, a.variant === 'primary' ? styles.primaryAction : styles.secondaryAction)}
          >
            {a.label}
          </a>
        ))}
      </div>
    </main>
  );
}