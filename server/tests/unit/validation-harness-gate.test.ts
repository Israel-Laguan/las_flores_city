/**
 * Unit test for the M20 deterministic validation-harness gate.
 *
 * Drives the REAL StoryBuilderOrchestrator.runSolidify (via approveAndSolidifyPlan)
 * with @las-flores/infra and the downstream materializers mocked. A plan carrying a
 * real duplicate-name conflict must be blocked to `failed` BEFORE any staging —
 * the harness gate must short-circuit before stagePlan/publishDrafts/migrate/verify.
 *
 * Collision-avoidance: dedicated synthetic UUIDs (see AGENTS.md).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const TEST_PLAN_ID = 'e0000000-e29b-41d4-a716-446655440001';
const ITEM_A = 'e0000000-e29b-41d4-a716-44665544000a';
const ITEM_B = 'e0000000-e29b-41d4-a716-44665544000b';

const CONFLICTING_PLAN = {
  id: TEST_PLAN_ID,
  description: 'Duplicate-name conflict plan',
  status: 'proposed',
  items: [
    {
      id: ITEM_A,
      type: 'character',
      action: 'create',
      name: 'Diego',
      slug: 'diego',
      fields: { title: 'Bartender' },
      assetNeeds: [],
      dependsOn: [],
    },
    {
      id: ITEM_B,
      type: 'character',
      action: 'create',
      name: 'Diego',
      slug: 'diego2',
      fields: { title: 'Doppelganger' },
      assetNeeds: [],
      dependsOn: [],
    },
  ],
  links: [],
};

jest.mock('@las-flores/infra', () => {
  const fakeClient = {
    query: jest.fn(async (text: string) => {
      if (text.includes('FOR UPDATE')) {
        return { rows: [{ plan_json: CONFLICTING_PLAN, status: 'proposed' }] };
      }
      return { rows: [] };
    }),
  };
  return {
    queryOLTP: jest.fn(async (text: string) => {
      if (text.includes('SELECT plan_json')) {
        return { rows: [{ plan_json: CONFLICTING_PLAN, status: 'proposed' }] };
      }
      // UPDATE ... SET status = $1 ... — the harness-blocked finalize
      return { rows: [], rowCount: 1 };
    }),
    queryOLAP: jest.fn(async () => ({ rows: [] })),
    withOLTPTransaction: jest.fn(async (cb: any) => cb(fakeClient)),
    getCache: jest.fn(async () => null),
    setCache: jest.fn(async () => true),
    deleteCache: jest.fn(async () => true),
    invalidatePattern: jest.fn(async () => true),
  };
});

jest.mock('../../src/services/ContentPlanService.js', () => ({
  ContentPlanService: {
    setStatus: jest.fn(async () => {}),
    getPlanStatus: jest.fn(async () => 'proposed'),
    updatePlanJson: jest.fn(async () => {}),
  },
  contentPlanService: {
    gatherContext: jest.fn(async () => ({
      characters: [],
      scenes: [],
      dialogues: [],
      missions: [],
      overlays: [],
      locations: [],
    })),
  },
}));

jest.mock('../../src/services/StoryBuilderPlanOps.js', () => ({
  stagePlan: jest.fn(async () => ({ success: true, createdFiles: [], updatedFiles: [], validationErrors: [], warnings: [] })),
  executePlan: jest.fn(),
  previewPlan: jest.fn(),
}));

jest.mock('../../src/services/AssetPublishService.js', () => ({
  publishChosenDrafts: jest.fn(async () => ({ success: true, published: [], errors: [] })),
}));

jest.mock('../../src/services/PlanVerificationService.js', () => ({
  verifyPlanCrossReferences: jest.fn(),
}));

jest.mock('../../src/content/migrate.js', () => ({
  migrateContent: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../src/services/AdminEventEmitter.js', () => ({
  emitAdminEvent: jest.fn(),
}));

import { approveAndSolidifyPlan } from '../../src/services/StoryBuilderOrchestrator.js';
import { queryOLTP } from '@las-flores/infra';
import { stagePlan } from '../../src/services/StoryBuilderPlanOps.js';
import { publishChosenDrafts } from '../../src/services/AssetPublishService.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;
const mockStagePlan = stagePlan as jest.MockedFunction<typeof stagePlan>;
const mockPublishDrafts = publishChosenDrafts as jest.MockedFunction<typeof publishChosenDrafts>;

const waitFor = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for runSolidify to settle');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('approveAndSolidifyPlan — validation harness gate (M20)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks a conflicting plan to failed before any staging', async () => {
    const result = await approveAndSolidifyPlan(TEST_PLAN_ID, '00000000-0000-0000-0000-000000000001');
    // approveAndSolidifyPlan resolves immediately with pending; runSolidify is async.
    expect(result.success).toBe(true);
    expect(result.status).toBe('pending');

    await waitFor(() =>
      mockQueryOLTP.mock.calls.some(
        ([text]) => typeof text === 'string' && text.includes('verification_report'),
      ),
    );

    // The gate must have written status='failed' via an UPDATE.
    const failedUpdate = mockQueryOLTP.mock.calls.find(
      ([text]) => typeof text === 'string' && text.includes('UPDATE content_plans SET status = $1') && text.includes('verification_report'),
    );
    expect(failedUpdate).toBeDefined();
    const [sql, params] = failedUpdate as [string, any[]];
    expect(params[0]).toBe('failed');
    // verification_report JSON carries the harness report.
    const report = JSON.parse(params[1]);
    expect(report.harnessReport).toBeDefined();
    expect(report.harnessReport.passed).toBe(false);
    expect(report.harnessReport.findings.some((f: any) => f.code === 'duplicate_slug_or_name')).toBe(true);

    // Downstream materializers must never run when the gate blocks. If the gate
    // passed, staging would begin and stagePlan would be called first.
    expect(mockStagePlan).not.toHaveBeenCalled();
    expect(mockPublishDrafts).not.toHaveBeenCalled();
  });
});