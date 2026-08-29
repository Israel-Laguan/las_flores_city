/**
 * Unit test for AICritiqueService.attachDiagnosticAnnotations — the bridge that
 * turns fail-open plan-intake diagnostics into reviewable `CritiqueAnnotation`s so
 * the existing comment/amend loop can be reused.
 *
 * Per AGENTS.md: pure unit test (jest.mock for @las-flores/infra + the Neo4j seam).
 */
import { describe, it, expect, jest as jestGlobals, beforeEach } from '@jest/globals';
import { queryOLTP, withOLTPTransaction } from '@las-flores/infra';
import type { CritiqueAnnotationDraft } from '@las-flores/shared';

jestGlobals.mock('@las-flores/infra', () => ({
  queryOLTP: jestGlobals.fn(),
  withOLTPTransaction: jestGlobals.fn(),
}));

// Keep the graph mirror out of the picture: persistAnnotations only writes graph
// nodes when Neo4j is enabled, and this test asserts the Postgres contract.
jestGlobals.mock('../../src/services/Neo4jClient.js', () => ({
  isNeo4jEnabled: jestGlobals.fn(() => false),
  runNeo4jQuery: jestGlobals.fn(async () => []),
  runNeo4jTransaction: jestGlobals.fn(async () => undefined),
}));

import { AICritiqueService } from '../../src/services/AICritiqueService.js';
import { MockProvider } from '../../src/services/MockProvider.js';

const mockQueryOLTP = jestGlobals.mocked(queryOLTP);
const mockWithOLTPTransaction = jestGlobals.mocked(withOLTPTransaction);

// Synthetic UUIDs dedicated to this test file (AGENTS.md).
const PLAN_ID = 'a8500000-e000-4000-8000-0000000000b0';
const SCENE_ID = 'a8500001-e000-4000-8000-0000000000b1';
const CHAR_ID = 'a8500002-e000-4000-8000-0000000000b2';

/** A diagnostic note draft as GraphIntakeService.triageAndAnnotate builds them. */
function draft(overrides: Partial<CritiqueAnnotationDraft> = {}): CritiqueAnnotationDraft {
  return {
    type: 'suggestion',
    severity: 'warning',
    description: '"City Center" is ambiguous — confirm which district you meant.',
    // A `suggestion` has no evidence requirement, so a diagnostic never has to
    // fabricate an excerpt to be persistable.
    evidence: [],
    relatedEntities: [{ entityType: 'Scene', slug: SCENE_ID }],
    scope: 'intake',
    aiModel: 'mock',
    planId: PLAN_ID,
    itemIds: [SCENE_ID],
    inputHash: '',
    ...overrides,
  } as CritiqueAnnotationDraft;
}

/** All SQL statements the service issued, flattened for substring assertions. */
function sqlCalls(): string[] {
  return mockQueryOLTP.mock.calls
    .map(([sql]) => (typeof sql === 'string' ? sql : ''))
    .filter((s) => s.length > 0);
}

function findCall(fragment: string): [string, unknown[]] | undefined {
  const call = mockQueryOLTP.mock.calls.find(
    ([sql]) => typeof sql === 'string' && sql.includes(fragment),
  );
  return call as [string, unknown[]] | undefined;
}

describe('AICritiqueService.attachDiagnosticAnnotations', () => {
  let service: AICritiqueService;

  beforeEach(() => {
    jestGlobals.clearAllMocks();
    jestGlobals.resetAllMocks();
    mockWithOLTPTransaction.mockImplementation(async (cb: (client: { query: typeof mockQueryOLTP }) => Promise<unknown>) =>
      cb({ query: mockQueryOLTP }),
    );
    mockQueryOLTP.mockResolvedValue({ rows: [] } as any);
    service = new AICritiqueService(new MockProvider());
  });

  it('persists each draft under scope "intake" with a stamped id/createdAt/status', async () => {
    const result = await service.attachDiagnosticAnnotations(PLAN_ID, [draft()]);

    expect(result).toHaveLength(1);
    const annotation = result[0];
    expect(annotation.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(annotation.createdAt).toEqual(expect.any(String));
    // 'open' is what makes the note answerable via plan:amend.
    expect(annotation.status).toBe('open');
    expect(annotation.scope).toBe('intake');
    expect(annotation.planId).toBe(PLAN_ID);

    const insert = findCall('INSERT INTO critique_annotations');
    expect(insert).toBeDefined();
    const params = insert![1];
    expect(params[0]).toBe(annotation.id);
    expect(params[1]).toBe('suggestion');
    expect(params[2]).toBe('warning');
    // scope is the 7th positional parameter of the INSERT.
    expect(params[6]).toBe('intake');
    expect(params[9]).toBe('open');
    expect(params[10]).toBe(PLAN_ID);
  });

  it('retires only prior OPEN annotations of scope "intake", never "entity"', async () => {
    await service.attachDiagnosticAnnotations(PLAN_ID, [draft()]);

    const del = findCall('DELETE FROM critique_annotations');
    expect(del).toBeDefined();
    // The retire-on-write predicate is (plan_id, scope, status='open'). Scoping to
    // 'intake' is what stops a real critique pass from wiping intake notes — and
    // stops intake from wiping the critique's own findings.
    expect(del![0]).toContain("status = 'open'");
    expect(del![1]).toEqual([PLAN_ID, 'intake']);
    expect(del![1]).not.toContain('entity');
  });

  it('returns [] and writes nothing for an empty draft list (no "no conflicts" marker)', async () => {
    const result = await service.attachDiagnosticAnnotations(PLAN_ID, []);

    expect(result).toEqual([]);
    // persistAnnotations inserts a `is_marker` "No conflicts found" row when handed
    // zero annotations. That is a critique-cache optimization; for intake it would
    // be a misleading fake note, so the empty case must short-circuit entirely —
    // including the retire DELETE, since there is nothing to replace.
    expect(mockQueryOLTP).not.toHaveBeenCalled();
    expect(sqlCalls().join(' ')).not.toContain('is_marker');
  });

  it('stamps a service-owned identity even when a draft tries to supply its own', async () => {
    const result = await service.attachDiagnosticAnnotations(PLAN_ID, [
      draft({
        planId: 'a8500009-e000-4000-8000-0000000000b9',
        // A caller must never control the cache key.
        inputHash: 'f'.repeat(64),
      } as Partial<CritiqueAnnotationDraft>),
    ]);

    // planId comes from the argument, not the draft, so a note can never be filed
    // against a different plan.
    expect(result[0].planId).toBe(PLAN_ID);
    // Intake notes are derived from the graph write set, not an LLM subgraph
    // analysis, so they must never participate in the critique cache.
    expect(result[0].inputHash).toBe('');
  });

  it('persists multiple notes in one transaction with distinct ids', async () => {
    const drafts = [
      draft({ itemIds: [SCENE_ID], relatedEntities: [{ entityType: 'Scene', slug: SCENE_ID }] }),
      draft({ itemIds: [CHAR_ID], relatedEntities: [{ entityType: 'Character', slug: CHAR_ID }] }),
    ];

    const result = await service.attachDiagnosticAnnotations(PLAN_ID, drafts);

    expect(result).toHaveLength(2);
    expect(result[0].id).not.toBe(result[1].id);
    // One transaction covers the retire + all inserts, so a partial note set can
    // never be observed.
    expect(mockWithOLTPTransaction).toHaveBeenCalledTimes(1);
    const inserts = sqlCalls().filter((s) => s.includes('INSERT INTO critique_annotations'));
    expect(inserts).toHaveLength(2);
  });

  it('preserves the itemIds/relatedEntities scoping the amend loop relies on', async () => {
    const result = await service.attachDiagnosticAnnotations(PLAN_ID, [draft()]);

    expect(result[0].itemIds).toEqual([SCENE_ID]);
    expect(result[0].relatedEntities).toEqual([{ entityType: 'Scene', slug: SCENE_ID }]);

    const insert = findCall('INSERT INTO critique_annotations');
    // item_ids is TEXT[]; the array is passed through so pg escapes it.
    expect(insert![1][11]).toEqual([SCENE_ID]);
  });
});
