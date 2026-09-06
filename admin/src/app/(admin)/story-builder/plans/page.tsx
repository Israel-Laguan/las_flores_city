/* eslint-disable max-lines -- plans page is a cohesive component module */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@las-flores/ui';
import {
  listPlans,
  deletePlan,
  rejectPlan,
  retryPlan,
  verifyPlan,
  stagePlan,
  approveAndSolidify,
  createPlanFromTemplate,
  type ListPlansFilters,
} from '../hooks/useStoryBuilderApi';
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
  rejected: 'var(--status-error, #ef4444)',
  pending: 'var(--status-warning, #f59e0b)',
  staging: 'var(--status-warning, #f59e0b)',
  migrating: 'var(--status-warning, #f59e0b)',
  verifying: 'var(--status-warning, #f59e0b)',
};

const ALL_STATUSES = [
  '', 'draft', 'proposed', 'approved', 'staged', 'migrated', 'verified', 'failed',
  'pending', 'staging', 'migrating', 'verifying', 'rejected',
];

function TemplateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (planId: string) => void;
}) {
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!templateId.trim() || !name.trim() || !slug.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createPlanFromTemplate(templateId.trim(), {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
      });
      if (result.success && result.data?.planId) {
        onCreated(result.data.planId);
        onClose();
      } else {
        setError(result.error || 'Failed to create plan from template');
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>New Plan from Template</h2>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className={styles.modalLabel}>
            Template ID
            <input
              className={styles.modalInput}
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              placeholder="e.g. mission, location"
              required
            />
          </label>
          <label className={styles.modalLabel}>
            Name
            <input
              className={styles.modalInput}
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </label>
          <label className={styles.modalLabel}>
            Slug
            <input
              className={styles.modalInput}
              value={slug}
              onChange={e => setSlug(e.target.value)}
              required
            />
          </label>
          <label className={styles.modalLabel}>
            Description (optional)
            <input
              className={styles.modalInput}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={cn('btn', 'btn--secondary')} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={cn('btn', 'btn--primary')} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailPanel({
  planId,
  onClose,
}: {
  planId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { adminFetch } = await import('@/lib/client-api');
        const data = await adminFetch<{ success: boolean; data?: any; error?: string }>(
          `/admin/story-builder/plans/${planId}`,
        );
        if (cancelled) return;
        if (data.success && data.data) setDetail(data.data);
        else setError(data.error || 'Failed to load plan');
      } catch (err: any) {
        if (!cancelled) setError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [planId]);

  return (
    <div className={styles.detailOverlay} onClick={onClose}>
      <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
        <div className={styles.detailHeader}>
          <h3>Plan Detail</h3>
          <button className={cn('btn', 'btn--secondary', 'btn--small')} onClick={onClose}>Close</button>
        </div>
        {loading && <div className={styles.loading}>Loading...</div>}
        {error && <div className="error-box">{error}</div>}
        {detail && (
          <div className={styles.detailContent}>
            <dl className={styles.detailDl}>
              <dt>ID</dt>
              <dd className={styles.detailId}>{detail.id}</dd>
              <dt>Description</dt>
              <dd>{detail.description}</dd>
              <dt>Status</dt>
              <dd>
                <span
                  className={styles.statusBadge}
                  style={{ backgroundColor: STATUS_COLORS[detail.status] || STATUS_COLORS.proposed }}
                >
                  {detail.status}
                </span>
              </dd>
              <dt>Created</dt>
              <dd suppressHydrationWarning>{new Date(detail.created_at).toLocaleString()}</dd>
              <dt>Updated</dt>
              <dd suppressHydrationWarning>{new Date(detail.updated_at).toLocaleString()}</dd>
            </dl>
            {detail.feedback_log && (
              <>
                <h4 className={styles.detailSubheading}>Feedback Log</h4>
                <pre className={styles.detailPre}>
                  {typeof detail.feedback_log === 'string'
                    ? detail.feedback_log
                    : JSON.stringify(detail.feedback_log, null, 2)}
                </pre>
              </>
            )}
            <div className={styles.detailActions}>
              <Link
                href={`/story-builder?planId=${detail.id}`}
                className={cn('btn', 'btn--primary', 'btn--small')}
              >
                Open in Story Builder
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickActions({
  plan,
  onAction,
  actionLoading,
}: {
  plan: Plan;
  onAction: (planId: string, action: string) => void;
  actionLoading: string | null;
}) {
  const isLoading = actionLoading === plan.id;
  const buttons: Array<{ label: string; action: string; className?: string }> = [];

  switch (plan.status) {
    case 'failed':
      buttons.push({ label: 'Retry', action: 'retry' });
      break;
    case 'migrated':
      buttons.push({ label: 'Verify', action: 'verify' });
      break;
    case 'approved':
    case 'proposed':
      buttons.push({ label: 'Stage', action: 'stage' });
      buttons.push({ label: 'Approve & Solidify', action: 'solidify', className: 'btn--success' });
      break;
  }

  if (buttons.length === 0) return null;

  return (
    <div className={styles.quickActions}>
      {buttons.map(btn => (
        <button
          key={btn.action}
          className={cn('btn', btn.className || 'btn--secondary', 'btn--small')}
          onClick={() => onAction(plan.id, btn.action)}
          disabled={isLoading}
        >
          {isLoading ? '...' : btn.label}
        </button>
      ))}
    </div>
  );
}

function PlanRow({
  plan,
  deletingId,
  onDelete,
  onReject,
  onAction,
  actionLoading,
  expanded,
  onToggleExpand,
}: {
  plan: Plan;
  deletingId: string | null;
  onDelete: (id: string) => void;
  onReject: (id: string) => void;
  onAction: (planId: string, action: string) => void;
  actionLoading: string | null;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <>
      <tr>
        <td>
          <button
            className={styles.expandBtn}
            onClick={() => onToggleExpand(plan.id)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        </td>
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
          {['verified', 'failed'].includes(plan.status) ? (
            <Link
              href={`/story-builder?planId=${plan.id}`}
              className={cn('btn', 'btn--secondary', 'btn--small')}
            >
              View Report
            </Link>
          ) : (
            <Link
              href={`/story-builder?planId=${plan.id}`}
              className={cn('btn', 'btn--secondary', 'btn--small')}
            >
              Resume
            </Link>
          )}
          <QuickActions plan={plan} onAction={onAction} actionLoading={actionLoading} />
          {plan.status === 'proposed' && (
            <button
              className={cn('btn', 'btn--warning', 'btn--small')}
              onClick={() => onReject(plan.id)}
              disabled={deletingId === plan.id}
            >
              Reject
            </button>
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
      {expanded && (
        <tr>
          <td colSpan={6} className={styles.expandedRow}>
            <DetailPanel planId={plan.id} onClose={() => onToggleExpand(plan.id)} />
          </td>
        </tr>
      )}
    </>
  );
}

function PlansTable({
  plans,
  deletingId,
  onDelete,
  onReject,
  onAction,
  actionLoading,
  expandedId,
  onToggleExpand,
}: {
  plans: Plan[];
  deletingId: string | null;
  onDelete: (id: string) => void;
  onReject: (id: string) => void;
  onAction: (planId: string, action: string) => void;
  actionLoading: string | null;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.expandCol}></th>
          <th>Description</th>
          <th>Status</th>
          <th>Items</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {plans.map(plan => (
          <PlanRow
            key={plan.id}
            plan={plan}
            deletingId={deletingId}
            onDelete={onDelete}
            onReject={onReject}
            onAction={onAction}
            actionLoading={actionLoading}
            expanded={expandedId === plan.id}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </tbody>
    </table>
  );
}

// eslint-disable-next-line max-lines-per-function -- plans list view with table, filters, pagination, modals
export default function StoryBuilderPlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at'>('updated_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const limit = 20;
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  const requestIdRef = useRef(0);

  const loadPlans = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const filters: ListPlansFilters = { limit, offset };
      if (debouncedSearch) filters.q = debouncedSearch;
      if (statusFilter) filters.status = statusFilter;
      filters.sortBy = sortBy;
      filters.order = order;

      const data = await listPlans(filters);
      if (requestId !== requestIdRef.current) return;
      if (data.success && data.data) {
        setPlans(data.data.plans);
        setTotal(data.data.total);
      } else {
        setError(data.error || 'Failed to load plans');
      }
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setError(err.message);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [offset, debouncedSearch, statusFilter, sortBy, order]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  function handleFilterChange(newStatus: string, newSortBy: 'created_at' | 'updated_at', newOrder: 'asc' | 'desc') {
    setStatusFilter(newStatus);
    setSortBy(newSortBy);
    setOrder(newOrder);
    setOffset(0);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const data = await deletePlan(id);
      if (data.success) {
        const remaining = plans.filter(p => p.id !== id);
        // If we deleted the last row on a paginated offset, step back a page.
        if (remaining.length === 0 && offset > 0) {
          setOffset(o => Math.max(0, o - limit));
        } else {
          setPlans(remaining);
          setTotal(prev => prev - 1);
        }
      } else {
        setError(data.error || 'Failed to delete plan');
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setDeletingId(prev => (prev === id ? null : prev));
    }
  }

  async function handleReject(id: string) {
    if (!confirm('Reject this plan? This will clean up graph deltas and mark it rejected.')) return;
    setDeletingId(id);
    try {
      const data = await rejectPlan(id);
      if (data.success) {
        setPlans(prev => prev.map(p => (p.id === id ? { ...p, status: 'rejected' } : p)));
      } else {
        setError(data.error || 'Failed to reject plan');
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setDeletingId(prev => (prev === id ? null : prev));
    }
  }

  async function handleAction(id: string, action: string) {
    setActionLoading(id);
    try {
      let result;
      switch (action) {
        case 'retry':
          result = await retryPlan(id);
          break;
        case 'verify':
          result = await verifyPlan(id);
          break;
        case 'stage':
          result = await stagePlan(id);
          break;
        case 'solidify':
          result = await approveAndSolidify(id);
          break;
        default:
          return;
      }
      if (result?.success) {
        await loadPlans();
      } else {
        setError(result?.error || `Failed to ${action} plan`);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setActionLoading(null);
    }
  }

  function handleTemplateCreated(planId: string) {
    window.location.href = `/story-builder?planId=${planId}`;
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Story Builder Plans</h1>
        <div className={styles.headerActions}>
          <button
            className={cn('btn', 'btn--secondary')}
            onClick={() => setTemplateModalOpen(true)}
          >
            + New from Template
          </button>
          <Link href="/story-builder" className={cn('btn', 'btn--primary')}>
            + New Plan
          </Link>
        </div>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search plans..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={e => handleFilterChange(e.target.value, sortBy, order)}
        >
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </select>
        <select
          className={styles.filterSelect}
          value={sortBy}
          onChange={e => handleFilterChange(statusFilter, e.target.value as 'created_at' | 'updated_at', order)}
        >
          <option value="updated_at">Updated</option>
          <option value="created_at">Created</option>
        </select>
        <button
          className={cn('btn', 'btn--secondary', 'btn--small')}
          onClick={() => handleFilterChange(statusFilter, sortBy, order === 'desc' ? 'asc' : 'desc')}
        >
          {order === 'desc' ? '\u2193 Desc' : '\u2191 Asc'}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading ? (
        <div className={styles.loading}>Loading plans...</div>
      ) : plans.length === 0 ? (
        <div className={styles.empty}>No plans found.</div>
      ) : (
        <>
          <PlansTable
            plans={plans}
            deletingId={deletingId}
            onDelete={handleDelete}
            onReject={handleReject}
            onAction={handleAction}
            actionLoading={actionLoading}
            expandedId={expandedId}
            onToggleExpand={id => setExpandedId(prev => (prev === id ? null : id))}
          />
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

      <TemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onCreated={handleTemplateCreated}
      />
    </main>
  );
}
