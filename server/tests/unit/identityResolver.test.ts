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

describe('IdentityResolver', () => {
  beforeEach(() => {
    queryOLTP.mockReset();
  });

  test('is a singleton with a public class', () => {
    expect(identityResolver).toBeInstanceOf(IdentityResolver);
  });

  test('matched — a single exact normalized alias resolves to its stable id', async () => {
    queryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS] });

    const result = await identityResolver.resolve('character', 'Marcus');

    expect(result).toEqual({
      status: 'matched',
      entityType: 'character',
      entityId: EXISTING_MARCUS.entity_id,
      alias: 'Marcus',
    });
  });

  test('matched — case/punctuation-insensitive matching (emit NormalizedName contract)', async () => {
    queryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS] });

    const result = await identityResolver.resolve('character', '  MAR-CUS! ');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.entityId).toBe(EXISTING_MARCUS.entity_id);
  });

  test('new_candidate — no alias hits surfaces a create proposal', async () => {
    queryOLTP.mockResolvedValueOnce({ rows: [] });

    const result = await identityResolver.resolve('character', 'Diego');
    expect(result).toEqual({
      status: 'new_candidate',
      entityType: 'character',
      suggestedName: 'Diego',
    });
  });

  test('ambiguous — multiple identities share a normalized name, surfaced not merged', async () => {
    const secondMarcus = { entity_id: 'a1940000-2222-4111-8111-111111111111', alias: 'Marcus', is_primary: true };
    queryOLTP.mockResolvedValueOnce({ rows: [EXISTING_MARCUS, secondMarcus] });

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
    queryOLTP.mockResolvedValueOnce({
      rows: [{ entity_id: EXISTING_MARCUS.entity_id, alias: 'Marcus II', is_primary: true }, second],
    });

    const result = await identityResolver.resolve('character', 'Marcus II');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.alternatives.some((a) => a.kind === 'new' && /II/.test(a.name))).toBe(true);
    }
  });

  test('ambiguous — reports exhaustion instead of a colliding new variant when all Roman variants are used', async () => {
    // Two entities already share the exact alias "Marcus II" → the query is
    // ambiguous. Additionally, every downstream variant Marcus III.. is already
    // taken, so the suffix space is exhausted: the resolver must NOT propose a
    // colliding eleventh name; it must surface an exhausted `new` alternative.
    // Stable synthetic UUIDs (collision-avoidance: dedicated block c100…).
    const baseId = 'c1000000-e29b-41d4-a716-44665544';
    const twoMarcusII = [
      { entity_id: `${baseId}0010`, alias: 'Marcus II', is_primary: true },
      { entity_id: `${baseId}0011`, alias: 'Marcus II', is_primary: true },
    ];
    // Local mirror of the resolver's Roman generator so filler aliases match
    // exactly what `suggestNextName` will probe (Marcus III, Marcus IV, …).
    const rtable: Array<[number, string]> = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
    ];
    const toRoman = (num: number): string => {
      let out = ''; let remaining = num;
      for (const [value, symbol] of rtable) {
        while (remaining >= value) { out += symbol; remaining -= value; }
      }
      return out;
    };
    // Fill Marcus III.. up past the search ceiling so no free variant exists.
    const filler: Array<{ entity_id: string; alias: string; is_primary: boolean }> = [];
    for (let n = 3; n <= 130; n += 1) {
      filler.push({ entity_id: `${baseId}${String(n).padStart(4, '0')}`, alias: `Marcus ${toRoman(n)}`, is_primary: true });
    }
    queryOLTP.mockResolvedValueOnce({ rows: [...twoMarcusII, ...filler] });

    const result = await identityResolver.resolve('character', 'Marcus II');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      const newAlt = result.alternatives.find((a) => a.kind === 'new');
      expect(newAlt).toBeDefined();
      // Must NOT be a usable variant — it carries the exhausted flag.
      expect((newAlt as any).exhausted).toBe(true);
      // The name must not look like a committable new variant.
      expect((newAlt as any).name).not.toMatch(/^new: Marcus \w+$/);
    }
  });

  test('ambiguous — a name ending in a numeral past X increments past it (no nested suffix)', async () => {
    // Two entities already share the exact alias "Marcus XI". The resolver must
    // propose the next variant as "Marcus XII" — NOT a nested "Marcus XI II".
    const twoMarcusXI = [
      { entity_id: 'c1010000-e29b-41d4-a716-446655440010', alias: 'Marcus XI', is_primary: true },
      { entity_id: 'c1010000-e29b-41d4-a716-446655440011', alias: 'Marcus XI', is_primary: true },
    ];
    queryOLTP.mockResolvedValueOnce({ rows: twoMarcusXI });

    const result = await identityResolver.resolve('character', 'Marcus XI');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      const newAlt = result.alternatives.find((a) => a.kind === 'new');
      expect(newAlt?.name).toBe('new: Marcus XII');
      expect(newAlt?.name).not.toMatch(/XI II/);
    }
  });

  test('ambiguous — suggests the first free numeral without probing past the ceiling', async () => {
    // "Marcus II" ambiguous, and only "Marcus III" already taken. The next free
    // variant must be "Marcus IV" (probed as soon as found, not at the cap).
    const rows = [
      { entity_id: 'c1020000-e29b-41d4-a716-446655440010', alias: 'Marcus II', is_primary: true },
      { entity_id: 'c1020000-e29b-41d4-a716-446655440011', alias: 'Marcus II', is_primary: true },
      { entity_id: 'c1020000-e29b-41d4-a716-446655440012', alias: 'Marcus III', is_primary: true },
    ];
    queryOLTP.mockResolvedValueOnce({ rows });

    const result = await identityResolver.resolve('character', 'Marcus II');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      const newAlt = result.alternatives.find((a) => a.kind === 'new');
      expect(newAlt?.name).toBe('new: Marcus IV');
      expect(newAlt?.exhausted).toBe(false);
    }
  });

  test('ambiguous — a bare single Roman token (e.g. "I" or "X") is NOT treated as a suffix', async () => {
    // Two entities already share the exact alias "X" → ambiguous. The proposed
    // new variant must be "new: X II" (base stays "X"), NOT "new: II" / Unnamed.
    const twoX = [
      { entity_id: 'c1030000-e29b-41d4-a716-446655440010', alias: 'X', is_primary: true },
      { entity_id: 'c1030000-e29b-41d4-a716-446655440011', alias: 'X', is_primary: true },
    ];
    queryOLTP.mockResolvedValueOnce({ rows: twoX });

    const result = await identityResolver.resolve('character', 'X');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      const newAlt = result.alternatives.find((a) => a.kind === 'new');
      expect(newAlt?.name).toBe('new: X II');
      expect(newAlt?.name).not.toMatch(/^new: II$/);
    }
  });

  test('ambiguous — a "Jr." / "Sr." suffix produces a Roman variant, case-insensitively', async () => {
    // Two entities already share the exact alias "Marcus Jr." → ambiguous. The
    // proposed new variant must be "new: Marcus II" (the Jr. is dropped), not
    // "new: Marcus Jr. II".
    const rows = [
      { entity_id: 'c1040000-e29b-41d4-a716-446655440010', alias: 'Marcus Jr.', is_primary: true },
      { entity_id: 'c1040000-e29b-41d4-a716-446655440011', alias: 'Marcus Jr.', is_primary: true },
    ];
    queryOLTP.mockResolvedValueOnce({ rows });

    const result = await identityResolver.resolve('character', 'Marcus Jr.');

    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      const newAlt = result.alternatives.find((a) => a.kind === 'new');
      expect(newAlt?.name).toBe('new: Marcus II');
      expect(newAlt?.name).not.toMatch(/Jr\.|Sr\./);
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