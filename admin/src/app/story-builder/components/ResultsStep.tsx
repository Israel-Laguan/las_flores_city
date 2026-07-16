'use client';

import Link from 'next/link';
import type { ContentPlan, ContentPlanItem } from '@las-flores/shared';
import VerificationReport from './VerificationReport';
import type { VerificationReport as VerificationReportData } from '@las-flores/shared';
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

function cn(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ');
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
  if (plan.items.length === 0) return null;
  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>Live content</h3>
      <ul className={styles.linkList}>
        {plan.items.map(item => {
          const href = liveContentHref(item);
          if (!href) return null;
          return (
            <li key={item.id}>
              <Link href={href} className={styles.contentLink} target="_blank" rel="noreferrer">
                {item.name || item.slug} ({item.type})
              </Link>
            </li>
          );
        })}
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

export default function ResultsStep({ result, plan, planId }: ResultsStepProps) {
  if (!result) return null;

  const verified = result.status === 'verified';
  const failed = result.status === 'failed';
  const itemResults = result.stage?.itemResults ?? [];

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>Step 3: Results &amp; Assets</h2>

      <StatusBox result={result} verified={verified} failed={failed} />

      <ItemResultsTable itemResults={itemResults} />

      {result.publish && <PublishedAssets publish={result.publish} />}

      {result.publish && <PublishErrors publish={result.publish} />}

      {result.verificationReport && (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>Verification report</h3>
          <VerificationReport report={result.verificationReport as unknown as VerificationReportData} />
        </div>
      )}

      {plan && <LiveContent plan={plan} />}

      <ActionLinks planId={planId} />
    </div>
  );
}

