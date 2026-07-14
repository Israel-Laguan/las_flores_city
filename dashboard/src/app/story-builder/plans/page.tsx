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
  parent_plan_id?: string;
}

interface VersionNode {
  id: string;
  description: string;
  status: string;
  created_at: string;
  children: VersionNode[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#555', color: '#999' },
  proposed: { bg: '#ffaa0022', color: '#ffaa00' },
  approved: { bg: '#00aaff22', color: '#00aaff' },
  staged: { bg: '#ff880022', color: '#ff8800' },
  migrated: { bg: '#00ff0022', color: '#00ff00' },
  failed: { bg: '#ff000022', color: '#ff4444' },
};

function PlansTable({ plans, onShowVersions }: { plans: PlanListItem[]; onShowVersions: (id: string) => void }) {
  return (
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
                  {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <Link href={`/story-builder?planId=${plan.id}`} style={{ ...styles.button, ...styles.secondaryButton, textDecoration: 'none', fontSize: '0.8rem' }}>
                    Open
                  </Link>
                  <button
                    style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => onShowVersions(plan.id)}
                  >
                    Versions
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PlansListPage() {
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [versionTree, setVersionTree] = useState<VersionNode | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);

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

  async function handleShowVersions(planId: string) {
    setSelectedPlanId(planId);
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/admin/story-builder/plans/${planId}/versions`);
      const data = await res.json();
      if (data.success) {
        setVersionTree(data.data);
      } else {
        setError(data.error || 'Failed to load versions');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoadingVersions(false);
    }
  }

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
        <PlansTable plans={plans} onShowVersions={handleShowVersions} />
      )}

      {selectedPlanId && (
        <VersionHistorySection
          versionTree={versionTree}
          loadingVersions={loadingVersions}
          onClose={() => {
            setSelectedPlanId(null);
            setVersionTree(null);
          }}
        />
      )}
    </main>
  );
}

function VersionHistorySection({
  versionTree,
  loadingVersions,
  onClose,
}: {
  versionTree: VersionNode | null;
  loadingVersions: boolean;
  onClose: () => void;
}) {
  return (
    <div style={{ ...styles.section, marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ ...styles.sectionHeading, marginBottom: 0 }}>Version History</h2>
        <button
          style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {loadingVersions ? (
        <p style={styles.muted}>Loading versions...</p>
      ) : versionTree ? (
        <VersionTree node={versionTree} onOpenPlan={(id) => window.location.href = `/story-builder?planId=${id}`} />
      ) : (
        <p style={styles.muted}>No version history available.</p>
      )}
    </div>
  );
}

function VersionTree({ node, onOpenPlan, depth = 0 }: { node: VersionNode; onOpenPlan: (id: string) => void; depth?: number }) {
  const statusStyle = STATUS_COLORS[node.status] || STATUS_COLORS.draft;
  return (
    <div style={{ marginLeft: depth > 0 ? '2rem' : 0, marginBottom: '0.75rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#0d0d1a',
        border: '1px solid #333',
        borderRadius: '3px'
      }}>
        <span style={{
          ...styles.badge,
          backgroundColor: statusStyle.bg,
          color: statusStyle.color,
          fontSize: '0.7rem',
        }}>
          {node.status}
        </span>
        <span style={{ color: '#aaa', fontSize: '0.85rem', flex: 1 }}>
          {node.description}
        </span>
        <span style={{ color: '#666', fontSize: '0.75rem' }}>
          {new Date(node.created_at).toLocaleString()}
        </span>
        <button
          style={{ ...styles.button, ...styles.secondaryButton, fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
          onClick={() => onOpenPlan(node.id)}
        >
          Open
        </button>
      </div>
      {node.children.map(child => (
        <VersionTree key={child.id} node={child} onOpenPlan={onOpenPlan} depth={depth + 1} />
      ))}
    </div>
  );
}