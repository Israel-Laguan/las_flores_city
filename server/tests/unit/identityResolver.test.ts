// ============================================================
// IdentityResolver — unit tests (M25)
//
// Verifies the three resolution outcomes required by §15.3:
//   * matched      — a single normalized alias hits exactly one entity
//   * new_candidate — no alias hits → propose a fresh entity
//   * ambiguous    — multiple distinct identities share a normalized name →
//                    surface alternatives (`["a193 Marcus", "new: Marcus II"]`)
// Never silently decides identity.
//
// DB is mocked via @las-flores/infra (queryOLTP). File-based location alias
// syncing and content-dir resolution are mocked so no real FS/glob runs.
// ============================================================

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@las-flores/infra', () => ({
  queryOLTP: jest.fn(),
}));

jest.mock('../../src/services/StoryBuilderLore.js', () => ({
  resolveContentDir: jest.fn(() => '/fake/content'),
}));

jest.mock('glob', () => ({
  glob: jest.fn(async () => []),
}));

import { IdentityResolver, identityResolver } from '../../src/services/IdentityResolver.js';

const queryOLTP: jest.MockedFunction<any> = (jest.requireMock('@las-flores/infra') as any).queryOLTP;

const EXISTING_MARCUS = { entity_id: 'a1930000-1111-4111-8111-111111111111', alias: 'Marcus', is_primary: true };

// Build a fresh per-invocation context as `resolve` now requires (the caches
// are confined to a single resolve pass, not the singleton).
function makeCtx() {
  return {
    aliasIndexCache: new Map(),
    canonicalSlugCache: new Map(),
  };
}

describe('IdentityResolver', () => {
  beforeEach(() => {
    queryOLTP.mockReset();
  });

  test('is a singleton with a public class', () => {
    expect(identityResolver).toBeInstanceOf(IdentityResolver);
  });

  test('matched — a single exact normalized alias resolves to its stable id', async () => {
    queryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS] });

    const result = await (identityResolver as any).resolve(makeCtx(), 'character', 'Marcus');

    expect(result).toEqual({
      status: 'matched',
      entityType: 'character',
      entityId: EXISTING_MARCUS.entity_id,
      alias: 'Marcus',
    });
  });

  test('matched — case/punctuation-insensitive matching (emit NormalizedName contract)', async () => {
    queryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS] });

    const result = await (identityResolver as any).resolve(makeCtx(), 'character', '  MAR-CUS! ');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.entityId).toBe(EXISTING_MARCUS.entity_id);
  });

  test('new_candidate — no alias hits surfaces a create proposal', async () => {
    queryOLTP.mockResolvedValueOnce({ rows: [] });

    const result = await (identityResolver as any).resolve(makeCtx(), 'character', 'Diego');
    expect(result).toEqual({
      status: 'new_candidate',
      entityType: 'character',
      suggestedName: 'Diego',
    });
  });

  test('ambiguous — multiple identities share a normalized name, surfaced not merged', async () => {
    const secondMarcus = { entity_id: 'a1940000-2222-4111-8111-111111111111', alias: 'Marcus', is_primary: true };
    queryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS, secondMarcus] });

    const result = await (identityResolver as any).resolve(makeCtx(), 'character', 'Marcus');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      // Two existing candidates + the always-present "new" option.
      expect(result.alternatives).toHaveLength(3);
      const existing = result.alternatives.filter((a) => a.kind === 'existing');
      expect(existing).toHaveLength(2);
      expect(existing.find((a) => a.id === EXISTING_MARCUS.entity_id)?.name).toContain('Marcus');
      expect(existing.find((a) => a.id === secondMarcus.entity_id)?.name).toContain('Marcus');
      const newAlt = result.alternatives.find((a) => a.kind === 'new');
      expect(newAlt?.name).toMatch(/^new:/);
    }
  });

  test('ambiguous — a `new: <name> II` suffix suggestion is offered for the next variant', async () => {
    // Two distinct entities sharing the exact alias "Marcus II" → ambiguous.
    const second = { entity_id: 'a1950000-3333-4111-8111-111111111111', alias: 'Marcus II', is_primary: true };
    queryOLTP.mockResolvedValueOnce({
      rows: [{ entity_id: EXISTING_MARCUS.entity_id, alias: 'Marcus II', is_primary: true }, second],
    });

    const result = await (identityResolver as any).resolve(makeCtx(), 'character', 'Marcus II');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.alternatives.some((a) => a.kind === 'new' && /II/.test(a.name))).toBe(true);
    }
  });

  test('resolvePlanItems flips a matched create item to update with a stable id', async () => {
    // One hit → not ambiguous here; but ensure matched items flip to update.
    queryOLTP.mockResolvedValue({ rows: [EXISTING_MARCUS] });

    const plan: any = {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      description: 'plan',
      status: 'draft',
      links: [],
      _meta: {},
      items: [
        {
          id: '11111111-2222-3333-4444-555555555555',
          type: 'character',
          action: 'create',
          name: 'Marcus',
          slug: 'marcus',
          fields: {},
          assetNeeds: [],
          dependsOn: [],
        },
      ],
    };

    const resolved = await identityResolver.resolvePlanItems(plan);
    const item = resolved.items[0];
    expect(item.resolution?.status).toBe('matched');
    expect(item.action).toBe('update');
    expect(item.entity_id).toBe(EXISTING_MARCUS.entity_id);
  });

  test('never silently decides: an ambiguous item stays a create proposal with status ambiguous', async () => {
    // Two distinct entities sharing the exact alias "Marcus" → ambiguous.
    const secondMarcus = { entity_id: 'a1950000-7777-4111-8111-111111111111', alias: 'Marcus', is_primary: true };
    queryOLTP.mockResolvedValue({ rows: [EXISTING_MARCUS, secondMarcus] });

    const plan: any = {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      description: 'plan',
      status: 'draft',
      links: [],
      _meta: {},
      items: [
        {
          id: '11111111-2222-3333-4444-555555555555',
          type: 'character',
          action: 'create',
          name: 'Marcus',
          slug: 'marcus',
          fields: {},
          assetNeeds: [],
          dependsOn: [],
        },
      ],
    };

    const resolved = await identityResolver.resolvePlanItems(plan);
    const item = resolved.items[0];
    // A regression in the "never silently decides" guard (§15.3) would fail here.
    expect(item.resolution?.status).toBe('ambiguous');
    expect(item.action).toBe('create');        // NOT flipped to update
    expect(item.entity_id).toBeUndefined();     // NO stable id pinned
    if (item.resolution?.status === 'ambiguous') {
      expect(item.resolution.alternatives.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('resolvePlanItems demotes an unverified update that resolves to a new candidate into a create', async () => {
    // Outline marks an item `update` but supplies no entity_id, and the name
    // matches no existing entity → the stale update must not be kept as an
    // `update` against a non-existent path; demote it to a create proposal.
    queryOLTP.mockResolvedValue({ rows: [] });

    const plan: any = {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      description: 'plan',
      status: 'draft',
      links: [],
      _meta: {},
      items: [
        {
          id: '11111111-2222-3333-4444-555555555555',
          type: 'character',
          action: 'update',
          name: 'Diego',
          slug: 'diego',
          fields: {},
          assetNeeds: [],
          dependsOn: [],
        },
      ],
    };

    const resolved = await identityResolver.resolvePlanItems(plan);
    const item = resolved.items[0];
    expect(item.resolution?.status).toBe('new_candidate');
    expect(item.action).toBe('create');
    expect(item.entity_id).toBeUndefined();
  });

  test('concurrent resolvePlanItems calls keep independent caches', async () => {
    // Two overlapping passes must not share/step on each other's per-pass
    // caches. Simulate this by running two passes whose alias queries return
    // different rows; each pass must resolve against its own result set.
    const marcusRow = { entity_id: 'a1930000-1111-4111-8111-111111111111', alias: 'Marcus', is_primary: true };
    const otherRow = { entity_id: 'b1930000-1111-4111-8111-111111111111', alias: 'Marcus', is_primary: true };

    const planMarcus: any = {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      description: 'plan',
      status: 'draft',
      links: [],
      _meta: {},
      items: [{ id: '11111111-2222-3333-4444-555555555555', type: 'character', action: 'create', name: 'Marcus', slug: 'marcus', fields: {}, assetNeeds: [], dependsOn: [] }],
    };
    const planOther: any = {
      id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      description: 'plan',
      status: 'draft',
      links: [],
      _meta: {},
      items: [{ id: '22222222-3333-4444-5555-666666666666', type: 'character', action: 'create', name: 'Marcus', slug: 'marcus', fields: {}, assetNeeds: [], dependsOn: [] }],
    };

    // Interleave: the first pass's query is answered for the second pass, and
    // vice versa, so any shared-cache bug surfaces as the wrong entity id.
    queryOLTP
      .mockResolvedValueOnce({ rows: [marcusRow] })  // pass A load
      .mockResolvedValueOnce({ rows: [otherRow] })   // pass B load
      .mockResolvedValue({ rows: [] });

    const [resolvedA, resolvedB] = await Promise.all([
      identityResolver.resolvePlanItems(planMarcus),
      identityResolver.resolvePlanItems(planOther),
    ]);

    expect(resolvedA.items[0].resolution?.status).toBe('matched');
    if (resolvedA.items[0].resolution?.status === 'matched') {
      expect(resolvedA.items[0].resolution.entityId).toBe(marcusRow.entity_id);
    }
    expect(resolvedB.items[0].resolution?.status).toBe('matched');
    if (resolvedB.items[0].resolution?.status === 'matched') {
      expect(resolvedB.items[0].resolution.entityId).toBe(otherRow.entity_id);
    }
  });
});