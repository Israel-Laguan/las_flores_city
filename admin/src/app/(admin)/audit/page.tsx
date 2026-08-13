'use client';

import { useState, useCallback, useEffect } from 'react';
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
}: {
  patch: Patch;
  onReject: (id: string) => void;
  onRollback: (id: string) => void;
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
            >
              Reject
            </button>
          ) : null}
          {patch.status === 'applied' ? (
            <button
              className={cn('btn', 'btn--warning', 'btn--sm')}
              onClick={() => onRollback(patch.id)}
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
}: {
  claim: Claim;
  onTransition: (id: string, to: string) => void;
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
            >
              Accept
            </button>
          ) : null}
          {claim.status === 'proposed' || claim.status === 'accepted' ? (
            <>
              <button
                className={cn('btn', 'btn--primary', 'btn--sm')}
                onClick={() => onTransition(claim.id, 'merged')}
              >
                Merge
              </button>
              <button
                className={cn('btn', 'btn--danger', 'btn--sm')}
                onClick={() => onTransition(claim.id, 'rejected')}
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

export default function AuditPage({ searchParams }: { searchParams?: { plan_id?: string } }) {
  const initialPlan = searchParams?.plan_id || '';
  const [planId, setPlanId] = useState(initialPlan);
  const [query, setQuery] = useState(initialPlan);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    try {
      const reason = window.prompt('Conflict reason for rejection:');
      await adminFetch(`/admin/audit/patches/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ conflictReason: reason || '' }),
      });
      load();
    } catch (e: any) {
      setError(e.message || 'Failed to reject patch');
    }
  };

  const onRollbackPatch = async (id: string) => {
    if (!window.confirm('Roll back this patch (restores prior canon snapshot)?')) return;
    try {
      await adminFetch(`/admin/audit/patches/${id}/rollback`, { method: 'POST' });
      load();
    } catch (e: any) {
      setError(e.message || 'Failed to rollback patch');
    }
  };

  const onTransitionClaim = async (id: string, to: string) => {
    try {
      const conflictReason = to === 'merged' || to === 'rejected' ? (window.prompt('Conflict / merge reason:') || '') : '';
      await adminFetch(`/admin/audit/claims/${id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to, conflictReason }),
      });
      load();
    } catch (e: any) {
      setError(e.message || 'Failed to transition claim');
    }
  };

  return (
    <div>
      <h1>Audit</h1>
      <p className="muted">Patch/revision history and claim provenance for a content plan.</p>
      {error ? <div className={styles.error}>{error}</div> : null}
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
      {loading ? <div className={styles.empty}>Loading…</div> : null}
      {!loading && query ? (
        <div className={styles.layout}>
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
                      <PatchRow key={p.id} patch={p} onReject={onRejectPatch} onRollback={onRollbackPatch} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

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
                      <ClaimRow key={c.id} claim={c} onTransition={onTransitionClaim} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}