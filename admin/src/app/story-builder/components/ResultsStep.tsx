'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@las-flores/ui';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import VerificationReport from './VerificationReport';
import type { VerificationReport as VerificationReportData } from '@las-flores/shared';
import { getJobStatus } from '../hooks/useStoryBuilderApi';
import styles from './ResultsStep.module.css';

/** Shape of the result returned by POST /plans/:id/approve-and-solidify. */
export interface SolidifyResultLite {
  success: boolean;
  status: string;
  stage?: {
    success?: boolean;
    itemResults?: Array<{ name: string; status: string; error?: string; filePath?: string }>;
    createdFiles?: string[];
    error?: string;
  };
  publish?: {
    success?: boolean;
    published: Array<{ itemId: string; itemType: string; needId: string; url: string; localFilename?: string }>;
    errors: string[];
  };
  migration?: { success?: boolean; migrationResult?: any; error?: string };
  verificationReport?: { success?: boolean; passed?: boolean; checks?: any[]; errors?: string[]; warnings?: string[] };
  error?: string;
}

interface ResultsStepProps {
  result: SolidifyResultLite | null;
  plan?: ContentPlan | null;
  planId?: string | null;
}

/** Build a client-side link to the live content for an item, if known. */
function liveContentHref(item: ContentPlanItem): string | null {
  const slug = item.slug;
  switch (item.type) {
    case 'character':
      return `/characters/${slug}`;
    case 'scene':
      return `/scenes/${slug}`;
    case 'location':
      return `/locations/${slug}`;
    case 'overlay':
      return `/overlays/${slug}`;
    case 'dialogue':
      return `/dialogues/${slug}`;
    case 'mission':
      return `/mysteries/${slug}`;
    case 'story':
      return `/stories/${slug}`;
    default:
      return null;
  }
}

function StatusBox({ result, verified, failed }: { result: SolidifyResultLite; verified: boolean; failed: boolean }) {
  return (
    <div className={verified ? styles.successBox : failed ? styles.errorBox : styles.neutralBox}>
      <p className={styles.boldText}>
        {verified ? '✓ Plan verified and shipped!' : failed ? '✗ Solidify failed' : 'Solidify finished'}
      </p>
      <p className={styles.statusLine}>
        Final status: <strong>{result.status}</strong>
      </p>
      {result.error && <p className={styles.errorText}>{result.error}</p>}
    </div>
  );
}

function ItemResultsTable({ itemResults }: { itemResults: NonNullable<SolidifyResultLite['stage']>['itemResults'] }) {
  if (!itemResults || itemResults.length === 0) return null;
  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Per-item results</h3>
      <table className={styles.itemTable}>
        <tbody>
          {itemResults.map((r, i) => (
            <tr key={i} className={styles.tableRow}>
              <td className={styles.tableCellName}>{r.name}</td>
              <td className={styles.tableCell}>
                <span
                  className={cn(
                    styles.statusBadge,
                    r.status === 'success' ? styles.statusSuccess : styles.statusError,
                  )}
                >
                  {r.status}
                </span>
              </td>
              <td className={styles.tableCellInfo}>{r.error || r.filePath || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PublishedAssets({ publish }: { publish: NonNullable<SolidifyResultLite['publish']> }) {
  if (publish.published.length === 0) return null;
  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Published assets ({publish.published.length})</h3>
      <ul className={styles.assetList}>
        {publish.published.map((p, i) => (
          <li key={i} className={styles.assetItem}>
            <span className={styles.assetTag}>{p.needId}</span>{' '}
            <a href={p.url} className={styles.assetLink} target="_blank" rel="noreferrer">
              {p.localFilename || p.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PublishErrors({ publish }: { publish: NonNullable<SolidifyResultLite['publish']> }) {
  if (publish.errors.length === 0) return null;
  return (
    <div className={styles.errorBox}>
      <p className={styles.boldText}>Asset publish errors</p>
      <ul className={styles.errorList}>
        {publish.errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

function LiveContent({ plan }: { plan: ContentPlan }) {
  const links = plan.items
    .map(item => ({ item, href: liveContentHref(item) }))
    .filter((entry): entry is { item: ContentPlanItem; href: string } => entry.href !== null);
  if (links.length === 0) return null;
  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Live content</h3>
      <ul className={styles.linkList}>
        {links.map(({ item, href }) => (
          <li key={item.id}>
            <Link href={href} className={styles.contentLink} target="_blank" rel="noreferrer">
              {item.name || item.slug} ({item.type})
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionLinks({ planId }: { planId?: string | null }) {
  return (
    <div className={styles.actions}>
      {planId && (
        <Link href={`/story-builder/plans?focus=${planId}`} className={`${styles.button} ${styles.secondaryButton}`}>
          View in DB
        </Link>
      )}
      <Link href="/assets" className={`${styles.button} ${styles.secondaryButton}`}>
        View Assets
      </Link>
      <Link href="/story-builder" className={`${styles.button} ${styles.primaryButton}`}>
        New Plan
      </Link>
    </div>
  );
}

const ASYNC_STATUSES = ['pending', 'staging', 'migrating', 'verifying'];

export default function ResultsStep({ result, plan, planId }: ResultsStepProps) {
  const [pollResult, setPollResult] = useState<SolidifyResultLite | null>(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const activeResult = pollResult ?? result;

  const poll = useCallback(async () => {
    if (!planId) return;
    try {
      const res = await getJobStatus(planId);
      if (res.success && res.data) {
        const mapped: SolidifyResultLite = {
          success: res.data.status === 'verified',
          status: res.data.status,
          stage: res.data.stage,
          publish: res.data.publish,
          migration: res.data.migration,
          verificationReport: res.data.verificationReport,
          error: res.data.error,
        };
        setPollResult(mapped);

        if (!ASYNC_STATUSES.includes(res.data.status)) {
          setPolling(false);
        }
      }
    } catch {
      // Non-fatal — will retry on next tick
    }
  }, [planId]);

  useEffect(() => {
    if (activeResult && ASYNC_STATUSES.includes(activeResult.status) && planId) {
      setPolling(true);
      intervalRef.current = setInterval(poll, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeResult?.status, planId, poll]);

  if (!activeResult) return null;

  const verified = activeResult.status === 'verified';
  const failed = activeResult.status === 'failed';
  const asyncInProgress = ASYNC_STATUSES.includes(activeResult.status);
  const itemResults = activeResult.stage?.itemResults ?? [];

  const stageLabels: Record<string, string> = {
    pending: 'Waiting to start...',
    staging: 'Writing content files...',
    migrating: 'Migrating to database...',
    verifying: 'Verifying cross-references...',
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Results</h2>

      {asyncInProgress && (
        <div className={styles.neutralBox}>
          <p className={styles.boldText}>{stageLabels[activeResult.status] || 'Processing...'}</p>
          <p className={styles.statusLine}>
            Status: <strong>{activeResult.status}</strong>
            {polling && <span style={{ marginLeft: 8, opacity: 0.6 }}>(polling every 3s)</span>}
          </p>
        </div>
      )}

      {!asyncInProgress && <StatusBox result={activeResult} verified={verified} failed={failed} />}

      <ItemResultsTable itemResults={itemResults} />

      {activeResult.publish && <PublishedAssets publish={activeResult.publish} />}

      {activeResult.publish && <PublishErrors publish={activeResult.publish} />}

      {activeResult.verificationReport && (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>Verification report</h3>
          <VerificationReport report={activeResult.verificationReport as unknown as VerificationReportData} />
        </div>
      )}

      {plan && <LiveContent plan={plan} />}

      <ActionLinks planId={planId} />
    </div>
  );
}

