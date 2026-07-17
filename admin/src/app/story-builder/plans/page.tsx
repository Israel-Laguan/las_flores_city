'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@las-flores/ui';
import { listPlans, deletePlan } from '../hooks/useStoryBuilderApi';
import styles from './plans.module.css';

interface Plan {
  id: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  item_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--status-info, #3b82f6)',
  proposed: 'var(--status-info, #3b82f6)',
  approved: 'var(--status-success, #10b981)',
  staged: 'var(--status-success, #10b981)',
  migrated: 'var(--status-success, #10b981)',
  verified: 'var(--status-success, #10b981)',
  failed: 'var(--status-error, #ef4444)',
};

function PlanRow({
  plan,
  deletingId,
  onDelete,
}: {
  plan: Plan;
  deletingId: string | null;
  onDelete: (id: string) => void;
}) {
  return (
    <tr>
      <td className={styles.descriptionCell}>{plan.description}</td>
      <td>
        <span
          className={styles.statusBadge}
          style={{ backgroundColor: STATUS_COLORS[plan.status] || STATUS_COLORS.proposed }}
        >
          {plan.status}
        </span>
      </td>
      <td>{plan.item_count}</td>
      <td suppressHydrationWarning>{new Date(plan.updated_at).toLocaleDateString()}</td>
      <td className={styles.actionsCell}>
        <Link
          href={`/story-builder?planId=${plan.id}`}
          className={cn('btn', 'btn--secondary', 'btn--small')}
        >
          Resume
        </Link>
        {plan.status === 'verified' && (
          <Link
            href={`/story-builder?planId=${plan.id}`}
            className={cn('btn', 'btn--secondary', 'btn--small')}
          >
            View Report
          </Link>
        )}
        <button
          className={cn('btn', 'btn--danger', 'btn--small')}
          onClick={() => onDelete(plan.id)}
          disabled={deletingId === plan.id}
        >
          {deletingId === plan.id ? '...' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}

function PlansTable({
  plans,
  deletingId,
  onDelete,
}: {
  plans: Plan[];
  deletingId: string | null;
  onDelete: (id: string) => void;
}) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Description</th>
          <th>Status</th>
          <th>Items</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {plans.map(plan => (
          <PlanRow key={plan.id} plan={plan} deletingId={deletingId} onDelete={onDelete} />
        ))}
      </tbody>
    </table>
  );
}

export default function StoryBuilderPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    const loadPlans = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listPlans(limit, offset);
        if (data.success && data.data) {
          setPlans(data.data.plans);
          setTotal(data.data.total);
        } else {
          setError(data.error || 'Failed to load plans');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadPlans();
  }, [offset]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const data = await deletePlan(id);
      if (data.success) setPlans(prev => prev.filter(p => p.id !== id));
      else setError(data.error || 'Failed to delete plan');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setDeletingId(prev => prev === id ? null : prev);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Story Builder Plans</h1>
        <Link href="/story-builder" className={cn('btn', 'btn--primary')}>
          + New Plan
        </Link>
      </div>
      {error && <div className="error-box">{error}</div>}
      {loading ? (
        <div className={styles.loading}>Loading plans...</div>
      ) : plans.length === 0 ? (
        <div className={styles.empty}>No plans found. Create your first plan!</div>
      ) : (
        <>
          <PlansTable plans={plans} deletingId={deletingId} onDelete={handleDelete} />
          {total > limit && (
            <div className={styles.pagination}>
              <button
                className={cn('btn', 'btn--secondary')}
                onClick={() => setOffset(o => Math.max(0, o - limit))}
                disabled={offset === 0}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>
                Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
              </span>
              <button
                className={cn('btn', 'btn--secondary')}
                onClick={() => setOffset(o => o + limit)}
                disabled={offset + limit >= total}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
