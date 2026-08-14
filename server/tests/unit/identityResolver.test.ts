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

const { queryOLTP } = jest.requireMock('@las-flores/infra') as { queryOLTP: jest.Mock };
const mockQueryOLTP = queryOLTP as jest.MockedFunction<any>;

import { IdentityResolver, identityResolver } from '../../src/services/IdentityResolver.js';

const EXISTING_MARCUS = { entity_id: 'a1930000-1111-4111-8111-111111111111', alias: 'Marcus', is_primary: true };

describe('IdentityResolver', () => {
  beforeEach(() => {
    mockQueryOLTP.mockReset();
  });

  test('is a singleton with a public class', () => {
    expect(identityResolver).toBeInstanceOf(IdentityResolver);
  });

  test('matched — a single exact normalized alias resolves to its stable id', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS] });

    const result = await identityResolver.resolve('character', 'Marcus');

    expect(result).toEqual({
      status: 'matched',
      entityType: 'character',
      entityId: EXISTING_MARCUS.entity_id,
      alias: 'Marcus',
    });
  });

  test('matched — case/punctuation-insensitive matching (emit NormalizedName contract)', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS] });

    const result = await identityResolver.resolve('character', '  MAR-CUS! ');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.entityId).toBe(EXISTING_MARCUS.entity_id);
  });

  test('new_candidate — no alias hits surfaces a create proposal', async () => {
    mockQueryOLTP.mockResolvedValueOnce({ rows: [] });

    const result = await identityResolver.resolve('character', 'Diego');
    expect(result).toEqual({
      status: 'new_candidate',
      entityType: 'character',
      suggestedName: 'Diego',
    });
  });

  test('ambiguous — multiple identities share a normalized name, surfaced not merged', async () => {
    const secondMarcus = { entity_id: 'a1940000-2222-4111-8111-111111111111', alias: 'Marcus', is_primary: true };
    mockQueryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS, secondMarcus] });

    const result = await identityResolver.resolve('character', 'Marcus');

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
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [{ entity_id: EXISTING_MARCUS.entity_id, alias: 'Marcus II', is_primary: true }, second],
    });

    const result = await identityResolver.resolve('character', 'Marcus II');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.alternatives.some((a) => a.kind === 'new' && /II/.test(a.name))).toBe(true);
    }
  });

  test('resolvePlanItems flips a matched create item to update with a stable id', async () => {
    // One hit → not ambiguous here; but ensure matched items flip to update.
    mockQueryOLTP.mockResolvedValue({ rows: [EXISTING_MARCUS] });

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
    mockQueryOLTP.mockResolvedValue({ rows: [EXISTING_MARCUS, secondMarcus] });

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
    mockQueryOLTP.mockResolvedValue({ rows: [] });

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
});