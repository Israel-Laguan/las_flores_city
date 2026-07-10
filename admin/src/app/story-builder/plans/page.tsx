'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { adminStyles as styles } from '@/lib/adminStyles';

interface PlanListItem {
  id: string;
  description: string;
  status: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#555', color: '#999' },
  proposed: { bg: '#ffaa0022', color: '#ffaa00' },
  approved: { bg: '#00aaff22', color: '#00aaff' },
  staged: { bg: '#ff880022', color: '#ff8800' },
  migrated: { bg: '#00ff0022', color: '#00ff00' },
  failed: { bg: '#ff000022', color: '#ff4444' },
};

export default function PlansListPage() {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlans() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/story-builder/plans');
        if (!res.ok) {
          setError(`Failed to load plans (HTTP ${res.status})`);
          return;
        }
        const data = await res.json();
        if (data.success && data.data?.plans) {
          setPlans(data.data.plans);
        } else {
          setError(data.error || 'Failed to load plans');
        }
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    }
    loadPlans();
  }, []);

  return (
    <main style={styles.main}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={styles.heading}>Story Builder Plans</h1>
        <Link href="/story-builder" style={{ ...styles.button, ...styles.primaryButton, textDecoration: 'none' }}>
          + New Plan
        </Link>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading ? (
        <p style={styles.muted}>Loading...</p>
      ) : plans.length === 0 ? (
        <div style={styles.section}>
          <p style={{ ...styles.muted, textAlign: 'center', padding: '2rem' }}>
            No plans yet. Create your first plan from the Story Builder.
          </p>
        </div>
      ) : (
        <div style={styles.section}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #00ff00', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem', color: '#00ff00' }}>Description</th>
                <th style={{ padding: '0.75rem', color: '#00ff00' }}>Status</th>
                <th style={{ padding: '0.75rem', color: '#00ff00' }}>Items</th>
                <th style={{ padding: '0.75rem', color: '#00ff00' }}>Updated</th>
                <th style={{ padding: '0.75rem' }}></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const statusStyle = STATUS_COLORS[plan.status] || STATUS_COLORS.draft;
                return (
                  <tr key={plan.id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '0.75rem', color: '#aaa', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {plan.description}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        ...styles.badge,
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                      }}>
                        {plan.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', color: '#aaa' }}>{plan.item_count}</td>
                    <td style={{ padding: '0.75rem', color: '#888', fontSize: '0.8rem' }}>
                      {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString() : '\u2014'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <Link href={`/story-builder?planId=${plan.id}`} style={{ ...styles.button, ...styles.secondaryButton, textDecoration: 'none', fontSize: '0.8rem' }}>
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
