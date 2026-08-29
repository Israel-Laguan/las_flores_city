// CLI plan amend — the other half of the fail-open intake loop.
//
// Intake never blocks on an ambiguous reference: it attaches an advisory note (a
// `CritiqueAnnotation` scoped 'intake') and lets the plan through. This command
// replies to one or more of those notes on the SAME plan, so the correction is
// incorporated in place instead of forcing a re-submission from scratch.
//
// Per note: propose against the plan scoped to that annotation, then apply the
// resulting deltas (ChatService marks the annotation 'addressed' once something
// actually lands). Because `applyDelta` MERGEs on (nodeType, nodeId, planId), a
// follow-up delta for the same key overwrites the flagged one — no separate
// "replace" mechanism is needed.
//
// Like `plan:intake`, this stops at `proposed`: it never stages, migrates,
// publishes, approves, or solidifies.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAmendArgs,
  resolveActor,
  reviewUrl,
  type AmendCliOptions,
} from '../src/planIntakeCore.js';
import type { IntakeDiagnostic } from '@las-flores/shared';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config();

/** Render one note as a directly runnable next step (see run_plan_intake.ts). */
function printNote(note: {
  nodeType: string;
  nodeId: string;
  field?: string;
  raw: string;
  status: string;
  suggestion?: string;
  candidates: Array<{ name: string; confidence: number }>;
  annotationId?: string;
}, planId: string): void {
  const where = note.field ? ` (${note.field})` : '';
  const candidates = note.candidates.length > 0
    ? ` — ${note.candidates.map((c) => `${c.name} (${c.confidence.toFixed(2)})`).join(' or ')}`
    : '';
  const suggestion = note.suggestion ? ` ${note.suggestion}` : '';
  console.error(`[note] ${note.nodeType}:${note.nodeId}${where} "${note.raw}" is ${note.status}${candidates}.${suggestion}`);
  if (note.annotationId) {
    console.error(`  → npm run plan:amend --workspace=server -- ${planId} --annotation ${note.annotationId}:"<your comment>"`);
  }
}

async function main(): Promise<void> {
  const options: AmendCliOptions = parseAmendArgs(process.argv);

  const infra = await import('@las-flores/infra');
  const { graphIntakeService } = await import('../src/services/GraphIntakeService.js');
  const { chatService } = await import('../src/services/ChatService.js');
  const { closeNeo4j } = await import('../src/services/Neo4jClient.js');

  try {
    const actor = await resolveActor(infra.queryOLTP, options);

    const planRow = await infra.queryOLTP<{ id: string; status: string }>(
      `SELECT id, status FROM content_plans WHERE id = $1`,
      [options.planId],
    );
    if (planRow.rows.length === 0) {
      throw new Error(`Plan ${options.planId} not found`);
    }

    const applied: Array<{
      annotationId: string;
      comment: string;
      appliedCount: number;
      droppedCount: number;
      reply: string;
      error?: string;
    }> = [];
    const amendmentDiagnostics: IntakeDiagnostic[] = [];

    for (const { annotationId, comment } of options.annotations) {
      // One amendment failing must not abandon the others — each note is an
      // independent correction, and the plan survives either way.
      try {
        const proposal = await chatService.propose(
          options.planId,
          [{ role: 'user', content: comment }],
          undefined,
          annotationId,
        );
        const result = await chatService.applyDeltas(
          options.planId,
          proposal.deltas,
          proposal.deltaEdges,
          annotationId,
        );
        applied.push({
          annotationId,
          comment,
          appliedCount: result.appliedCount,
          droppedCount: result.diagnostics.length,
          reply: proposal.reply,
        });
        // Carry every unresolved dropped delta/edge into the refreshed note set so
        // a partially-applied amendment still surfaces a replacement intake note.
        amendmentDiagnostics.push(...result.diagnostics);
      } catch (err) {
        applied.push({
          annotationId,
          comment,
          appliedCount: 0,
          droppedCount: 0,
          reply: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Re-triage from the refreshed graph so the printed notes reflect reality —
    // including a FRESH note if an amendment only partially resolved the ambiguity.
    const graph = await graphIntakeService.getPlanDeltas(options.planId);
    const notes = await graphIntakeService.triageAndAnnotate(options.planId, graph.deltas, amendmentDiagnostics);

    console.log(JSON.stringify({
      planId: options.planId,
      status: planRow.rows[0].status,
      actor: { id: actor.id, email: actor.email, role: actor.role },
      amendments: applied,
      deltaCount: graph.deltas.length,
      edgeCount: graph.edges.length,
      notes,
      reviewUrl: reviewUrl(
        options.adminUrl ?? process.env.ADMIN_URL ?? 'http://localhost:3002',
        options.planId,
      ),
      next: notes.length > 0
        ? 'Some references are still unresolved — reply to the remaining notes below.'
        : 'All intake notes are resolved. Review the plan before invoking approval/solidify; no content files or canonical rows were changed.',
    }, null, 2));

    for (const note of notes) printNote(note, options.planId);

    const failures = applied.filter((a) => a.error);
    if (failures.length > 0) {
      for (const f of failures) {
        console.error(`[plan:amend] annotation ${f.annotationId} failed: ${f.error}`);
      }
      process.exitCode = 1;
    }
  } finally {
    await closeNeo4j();
    await infra.closeConnections();
  }
}

main().catch((error: unknown) => {
  console.error(`[plan:amend] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
