'use client';

/* eslint-disable max-lines */

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import styles from './audit.module.css';

interface Patch {
  id: string;
  planId: string | null;
  title: string;
  description: string | null;
  status: 'proposed' | 'applied' | 'rejected' | 'rolled_back';
  conflictReason: string | null;
  appliedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  patchJson: { ops: Array<{ entityType: string; entityId: string; op: string }> };
}

interface Claim {
  id: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'merged';
  claimText: string;
  sourceSpan: string | null;
  sourceRef: string | null;
  confidence: number | null;
  conflictReason: string | null;
  createdAt: string;
}

const PATCH_STATUS: Record<string, string> = {
  proposed: 'badge--warning',
  applied: 'badge--success',
  rejected: 'badge--danger',
  rolled_back: 'badge--muted',
};

const CLAIM_STATUS: Record<string, string> = {
  proposed: 'badge--warning',
  accepted: 'badge--success',
  rejected: 'badge--danger',
  merged: 'badge--info',
};

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <span className={cn('badge', map[status] || 'badge--muted')}>{status}</span>
  );
}

function PatchRow({
  patch,
  onReject,
  onRollback,
  isInFlight,
}: {
  patch: Patch;
  onReject: (id: string) => void;
  onRollback: (id: string) => void;
  isInFlight: boolean;
}) {
  return (
    <tr>
      <td className={styles.td}>
        <div className={styles.mono}>{patch.title}</div>
        <div className={styles.muted}>
          {new Date(patch.createdAt).toLocaleString()}
        </div>
      </td>
      <td className={styles.td}>
        <StatusBadge status={patch.status} map={PATCH_STATUS} />
        {patch.conflictReason ? (
          <div className={styles.muted}>{patch.conflictReason}</div>
        ) : null}
      </td>
      <td className={styles.td}>
        <div className={styles.mono}>{patch.patchJson?.ops?.length ?? 0} entities</div>
      </td>
      <td className={styles.td}>
        <div className={styles.actions}>
          {patch.status === 'proposed' ? (
            <button
              className={cn('btn', 'btn--danger', 'btn--sm')}
              onClick={() => onReject(patch.id)}
              disabled={isInFlight}
            >
              Reject
            </button>
          ) : null}
          {patch.status === 'applied' ? (
            <button
              className={cn('btn', 'btn--warning', 'btn--sm')}
              onClick={() => onRollback(patch.id)}
              disabled={isInFlight}
            >
              Rollback
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function ClaimRow({
  claim,
  onTransition,
  isInFlight,
}: {
  claim: Claim;
  onTransition: (id: string, to: string) => void;
  isInFlight: boolean;
}) {
  return (
    <tr>
      <td className={styles.td}>
        {claim.claimText}
        {claim.sourceSpan ? (
          <div className={styles.muted}>Span: {claim.sourceSpan}</div>
        ) : null}
        {claim.sourceRef ? (
          <div className={styles.muted}>Ref: {claim.sourceRef}</div>
        ) : null}
      </td>
      <td className={styles.td}>
        <StatusBadge status={claim.status} map={CLAIM_STATUS} />
        {claim.confidence != null ? (
          <div className={styles.muted}>{(claim.confidence * 100).toFixed(0)}%</div>
        ) : null}
      </td>
      <td className={styles.td}>
        {claim.conflictReason ? (
          <div className={styles.muted}>{claim.conflictReason}</div>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className={styles.td}>
        <div className={styles.actions}>
          {claim.status === 'proposed' ? (
            <button
              className={cn('btn', 'btn--success', 'btn--sm')}
              onClick={() => onTransition(claim.id, 'accepted')}
              disabled={isInFlight}
            >
              Accept
            </button>
          ) : null}
          {claim.status === 'proposed' || claim.status === 'accepted' ? (
            <>
              <button
                className={cn('btn', 'btn--primary', 'btn--sm')}
                onClick={() => onTransition(claim.id, 'merged')}
                disabled={isInFlight}
              >
                Merge
              </button>
              <button
                className={cn('btn', 'btn--danger', 'btn--sm')}
                onClick={() => onTransition(claim.id, 'rejected')}
                disabled={isInFlight}
              >
                Reject
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

// eslint-disable-next-line max-lines-per-function
function AuditPageView() {
  const searchParams = useSearchParams();
  const initialPlan = searchParams.get('plan_id') || '';
  const [planId, setPlanId] = useState(initialPlan);
  const [query, setQuery] = useState(initialPlan);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inFlightId, setInFlightId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!query) {
      setPatches([]);
      setClaims([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [patchRes, claimRes] = await Promise.all([
        adminFetch<{ success: boolean; data: Patch[] }>(`/admin/audit/patches?plan_id=${encodeURIComponent(query)}`),
        adminFetch<{ success: boolean; data: Claim[] }>(`/admin/audit/claims?plan_id=${encodeURIComponent(query)}`),
      ]);
      setPatches(patchRes.success ? patchRes.data : []);
      setClaims(claimRes.success ? claimRes.data : []);
    } catch (e: any) {
      setError(e.message || 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const onRejectPatch = async (id: string) => {
    const reason = window.prompt('Conflict reason for rejection:');
    if (reason === null) return;
    setInFlightId(id);
    try {
      await adminFetch(`/admin/audit/patches/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ conflictReason: reason }),
      });
      load();
    } catch (e: any) {
      setError(e.message || 'Failed to reject patch');
    } finally {
      setInFlightId(null);
    }
  };

  const onRollbackPatch = async (id: string) => {
    if (!window.confirm('Roll back this patch (restores prior canon snapshot)?')) return;
    setInFlightId(id);
    try {
      await adminFetch(`/admin/audit/patches/${id}/rollback`, { method: 'POST' });
      load();
    } catch (e: any) {
      setError(e.message || 'Failed to rollback patch');
    } finally {
      setInFlightId(null);
    }
  };

  const onTransitionClaim = async (id: string, to: string) => {
    const conflictReason =
      to === 'merged' || to === 'rejected' ? window.prompt('Conflict / merge reason:') : '';
    if (to === 'merged' || to === 'rejected') {
      // A cancelled prompt aborts the action; an explicit empty string still proceeds.
      if (conflictReason === null) return;
    }
    setInFlightId(id);
    try {
      await adminFetch(`/admin/audit/claims/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to, conflictReason }),
      });
      load();
    } catch (e: any) {
      setError(e.message || 'Failed to transition claim');
    } finally {
      setInFlightId(null);
    }
  };

  if (loading) {
    return (
      <div>
        <Toolbar planId={planId} setPlanId={setPlanId} setQuery={setQuery} />
        <div className={styles.empty}>Loading…</div>
      </div>
    );
  }

  return (
    <div>
      <h1>Audit</h1>
      <p className="muted">Patch/revision history and claim provenance for a content plan.</p>
      {error ? <div className={styles.error}>{error}</div> : null}
      <Toolbar planId={planId} setPlanId={setPlanId} setQuery={setQuery} />
      {query ? (
        <div className={styles.layout}>
          <PatchesPanel patches={patches} onReject={onRejectPatch} onRollback={onRollbackPatch} inFlightId={inFlightId} />
          <ClaimsPanel claims={claims} onTransition={onTransitionClaim} inFlightId={inFlightId} />
        </div>
      ) : null}
    </div>
  );
}

function Toolbar({
  planId, setPlanId, setQuery,
}: {
  planId: string;
  setPlanId: (v: string) => void;
  setQuery: (v: string) => void;
}) {
  return (
    <div className={styles.toolbar}>
      <input
        className="input"
        placeholder="Plan UUID"
        aria-label="Plan UUID"
        value={planId}
        onChange={(e) => setPlanId(e.target.value)}
      />
      <button className={cn('btn', 'btn--primary')} onClick={() => setQuery(planId)}>
        Load
      </button>
    </div>
  );
}

function PatchesPanel({
  patches, onReject, onRollback, inFlightId,
}: {
  patches: Patch[];
  onReject: (id: string) => void;
  onRollback: (id: string) => void;
  inFlightId: string | null;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>Patches / Revisions</span>
        <span className={styles.muted}>{patches.length}</span>
      </div>
      <div className={styles.panelBody}>
        {patches.length === 0 ? (
          <div className={styles.empty}>No patches for this plan.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Patch</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Entities</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patches.map((p) => (
                <PatchRow key={p.id} patch={p} onReject={onReject} onRollback={onRollback} isInFlight={inFlightId === p.id} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ClaimsPanel({
  claims, onTransition, inFlightId,
}: {
  claims: Claim[];
  onTransition: (id: string, to: string) => void;
  inFlightId: string | null;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <span>Claims / Evidence</span>
        <span className={styles.muted}>{claims.length}</span>
      </div>
      <div className={styles.panelBody}>
        {claims.length === 0 ? (
          <div className={styles.empty}>No claims for this plan.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Claim</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Conflict</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <ClaimRow key={c.id} claim={c} onTransition={onTransition} isInFlight={inFlightId === c.id} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={null}>
      <AuditPageView />
    </Suspense>
  );
}