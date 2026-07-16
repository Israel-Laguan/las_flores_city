# Milestone 05 — Verification step (cross-reference checks)

## Goal

After the migration runs, run a comprehensive cross-reference check on the
newly-migrated rows. Save the report on the `content_plans.verification_report`
JSONB column. Set `status='verified'` if all checks pass, `status='failed'`
if any errors.

This is the "checked/verified" stage the user requested. It catches the
silent drift the current pipeline allows (broken `lore_path` references,
broken asset URLs, missing FKs).

## Status

> **Status: PARTIAL — `verifyPlan` stub exists; real checks pending.**

- `content_plans.verification_report` JSONB column and the `verified` status
  value exist (Milestone 02 done).
- `verifyPlan(planId)` exists in `server/src/services/StoryBuilderOrchestrator.ts`
  but is a **stub**: it only confirms the plan is `migrated` and returns
  `{ success: true, checks: [] }`. It does **not** yet run the cross-reference
  checks below.
- `PlanVerificationService.ts` and the real `GET /plans/:id/verification`
  behaviour are **not implemented**.
- Consequently `approveAndSolidifyPlan()` (Milestone 04) sets `status='verified'`
  without any real verification. That is acceptable as a temporary happy-path
  state, but the Validation-gate items 1–2 (real pass/fail checks) are **not**
  satisfied yet.

> **Doc drift:** the "Persisting the report" snippet below shows `verifyPlan`
> writing `verification_report`. In the current code the
> `UPDATE content_plans SET verification_report = ...` is performed by
> `approveAndSolidifyPlan` itself (twice — on failure and on success), not by a
> separate `verifyPlan` DB write.

## Pre-requisites

- Milestone 02 (`verification_report` column exists, `verified` is a valid
  `content_plans.status` value).

## Files to change

### New service — **PENDING (not implemented)**

- `server/src/services/PlanVerificationService.ts` — new file with the
  `verifyPlan(planId): Promise<VerificationReport>` function. Returns a
  report with `errors[]`, `warnings[]`, `checks[]`, and a `passed: boolean`.

### New route — **PENDING (stub only)**

- `server/src/routes/admin-story-builder-actions.ts` — `GET /plans/:id/verification` already exists but returns a stub (`checks: []`). Real behaviour: return the saved
  `verification_report` from the `content_plans` row.

### Orchestrator method — **DONE (stub)**

- `server/src/services/StoryBuilderOrchestrator.ts` — `verifyPlan(planId)` already exists but is a **stub**. It must be extended to call `PlanVerificationService.verifyPlan()` (once M05 implements it) and return the full report. Called by `approveAndSolidifyPlan()` (Milestone 04) after
  `migrateStagedPlan()`.

### Admin UI

- `admin/src/app/story-builder/components/VerificationReport.tsx` — new
  component. Renders the report as a collapsible list of checks, each with
  a pass/fail/warning icon. Used in the "Results" step of the wizard and on
  the `/story-builder/plans` detail page.

## Implementation outline

### The verification checks

```ts
// server/src/services/PlanVerificationService.ts
export interface VerificationReport {
  planId: string;
  checkedAt: string;  // ISO timestamp
  passed: boolean;
  checks: CheckResult[];
  errors: string[];
  warnings: string[];
}

export interface CheckResult {
  name: string;        // 'lore_path_resolution', 'asset_url_reachable', etc.
  description: string;
  status: 'pass' | 'fail' | 'warn';
  details?: string[];  // per-item results
}

export async function verifyPlan(planId: string): Promise<VerificationReport> {
  const plan = await loadPlan(planId);
  const checks: CheckResult[] = [];

  // 1. lore_path resolution (files exist on disk)
  checks.push(await checkLorePaths(plan));

  // 2. narrative_path resolution
  checks.push(await checkNarrativePaths(plan));

  // 3. asset_paths.<field> URLs are reachable
  checks.push(await checkAssetUrls(plan));

  // 4. FK integrity (scenes → dialogues, scenes → characters, etc.)
  checks.push(await checkForeignKeys(plan));

  // 5. Story beat references
  checks.push(await checkStoryBeatReferences(plan));

  // 6. Mystery references (overlays → mysteries, vault → mysteries)
  checks.push(await checkMysteryReferences(plan));

  // 7. Asset need status sanity (every published need has a URL)
  checks.push(await checkAssetNeedSanity(plan));

  const errors = checks.filter(c => c.status === 'fail').map(c => c.name);
  const warnings = checks.filter(c => c.status === 'warn').map(c => c.name);
  return {
    planId,
    checkedAt: new Date().toISOString(),
    passed: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}
```

### Individual check implementations (sketch)

```ts
async function checkLorePaths(plan: ContentPlan): Promise<CheckResult> {
  const details: string[] = [];
  for (const item of plan.items) {
    if (!item.fields.lore_path) continue;
    const fullPath = path.resolve(entityRoot(item), item.fields.lore_path);
    try {
      await fs.access(fullPath);
    } catch {
      details.push(`MISSING: ${item.name} → ${item.fields.lore_path}`);
    }
  }
  return {
    name: 'lore_path_resolution',
    description: 'All lore_path references point to existing files on disk.',
    status: details.length === 0 ? 'pass' : 'fail',
    details,
  };
}

async function checkAssetUrls(plan: ContentPlan): Promise<CheckResult> {
  const details: string[] = [];
  for (const item of plan.items) {
    const entity = await loadMigratedEntity(item);
    for (const [field, url] of Object.entries(entity.asset_paths ?? {})) {
      if (!url) continue;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) details.push(`UNREACHABLE: ${item.name}.${field} → ${url} (HTTP ${res.status})`);
      } catch (err: any) {
        details.push(`UNREACHABLE: ${item.name}.${field} → ${url} (${err.message})`);
      }
    }
  }
  return {
    name: 'asset_url_reachable',
    description: 'All asset URLs in the DB return HTTP 200 on HEAD.',
    status: details.length === 0 ? 'pass' : 'fail',
    details,
  };
}

async function checkForeignKeys(plan: ContentPlan): Promise<CheckResult> {
  const details: string[] = [];
  for (const item of plan.items) {
    if (item.type === 'scene') {
      const scene = await loadMigratedEntity(item);
      for (const dialogueId of scene.available_dialogues ?? []) {
        if (!await existsInDB('dialogue_trees', dialogueId)) {
          details.push(`MISSING FK: scene ${item.name} references dialogue ${dialogueId} which does not exist`);
        }
      }
      for (const npcId of scene.metadata?.npcs ?? []) {
        if (!await existsInDB('characters', npcId)) {
          details.push(`MISSING FK: scene ${item.name} references character ${npcId} which does not exist`);
        }
      }
    }
    if (item.type === 'dialogue') {
      const dialogue = await loadMigratedEntity(item);
      for (const node of Object.values(dialogue.nodes ?? {})) {
        for (const choice of node.choices ?? []) {
          if (choice.next_node_id && !dialogue.nodes?.[choice.next_node_id]) {
            details.push(`BROKEN CHOICE: dialogue ${item.name} node ${node.id} choice ${choice.id} points to non-existent node ${choice.next_node_id}`);
          }
        }
      }
    }
  }
  return {
    name: 'foreign_key_integrity',
    description: 'All FK references in migrated data resolve to existing rows.',
    status: details.length === 0 ? 'pass' : 'fail',
    details,
  };
}
```

The remaining checks (`checkStoryBeatReferences`, `checkMysteryReferences`,
`checkAssetNeedSanity`) follow the same pattern.

### Persisting the report

```ts
// server/src/services/StoryBuilderOrchestrator.ts
export async function verifyPlan(planId: string): Promise<VerificationReport> {
  const report = await PlanVerificationService.verifyPlan(planId);
  await queryOLTP(
    'UPDATE content_plans SET verification_report = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(report), planId]
  );
  return report;
}
```

## Tests to add or update

- `server/tests/unit/PlanVerificationService.test.ts` — new file. Tests
  each check in isolation with mock DB responses and a hermetic file system.
- `server/tests/integration/verify-plan.test.ts` — new file. End-to-end
  test that:
  1. Creates a plan with a deliberately broken `lore_path`.
  2. Migrates it (passes — the broken path is a YAML string, not a
     validator-checked constraint).
  3. Calls `/verify`.
  4. Asserts the report has a `fail` check for `lore_path_resolution`.
- `admin/src/app/story-builder/__tests__/VerificationReport.test.tsx` —
  new file. Renders a sample report and confirms the UI shows errors
  prominently.

## Validation gate

1. A plan with a broken `lore_path` produces a verification report with
   `passed: false` and a `fail` check.
2. A plan with all references intact produces `passed: true` and all
   `pass` checks.
3. The verification report is persisted on the `content_plans` row and
   visible in the admin `/story-builder/plans/<id>` page.
4. The verification runs in under 30 seconds for a typical plan.
5. `npm run lint --workspace=server` → 0 errors.
6. `npm run test --workspace=server` → all green.
7. `npm run build --workspace=server` → passes.

## Rollback plan

The new service is a new file. The new route is additive. The new
`verification_report` column is nullable, so existing plans are unaffected.
Removing the `verifyPlan()` call from `approveAndSolidifyPlan()` (Milestone
04) reverts to the previous behavior (migration = terminal).
