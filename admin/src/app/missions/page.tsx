'use client';

import { useState, useEffect } from 'react';
import ContentListPage from '@/components/ContentListPage';
import Badge from '@/components/Badge';
import { adminFetch } from '@/lib/client-api';
import styles from './missions.module.css';

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'ACTIVE' ? 'success' : status === 'RESOLVING' ? 'warning' : 'muted';
  return <Badge variant={variant as any}>{status}</Badge>;
}

const columns = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status', render: (item: any) => <StatusBadge status={item.status} /> },
  { key: 'expiresAt', label: 'Expires', render: (item: any) => item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : '—' },
  { key: 'createdAt', label: 'Created', render: (item: any) => new Date(item.createdAt).toLocaleDateString() },
];

interface MissionClaimStat {
  dialogueId: string;
  dialogueName: string;
  claims: number;
  uniqueUsers: number;
  completionRate: number;
  lastClaim: string;
}

export default function MissionsPage() {
  const [stats, setStats] = useState<{ totalClaims: number; totalPlayers: number } | null>(null);

  useEffect(() => {
    adminFetch<{ success: boolean; data?: MissionClaimStat[] }>('/admin/analytics/missions')
      .then(res => {
        if (res.success && res.data) {
          const claims = res.data.reduce((s, r) => s + r.claims, 0);
          const players = res.data.reduce((s, r) => s + r.uniqueUsers, 0);
          setStats({ totalClaims: claims, totalPlayers: players });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {stats && (
        <div className={styles.statBar}>
          <span className={styles.statItem}><strong>{stats.totalClaims}</strong> reward claims</span>
          <span className={styles.statItem}><strong>{stats.totalPlayers}</strong> unique players</span>
        </div>
      )}
      <ContentListPage
        title="Missions"
        heading="Mission List"
        endpoint="/admin/missions"
        detailPath="/missions"
        columns={columns}
      />
    </div>
  );
}
