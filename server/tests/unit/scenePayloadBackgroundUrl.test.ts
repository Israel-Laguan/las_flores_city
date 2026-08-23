// ============================================================
// assembleScenePayload() — background_urls passthrough
//
// Verifies that the player-facing scene payload carries the
// variant-tagged `background_urls[]` variant pool from the scene
// row through to the VN layer (as `scene.backgroundUrls`), without
// disturbing the resolved default `scene.backgroundUrl`.
// ============================================================

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const cacheStore = new Map<string, any>();

jest.mock('@las-flores/infra', () => (() => {
  const handler = jest.fn(async (text: string) => {
    if (text.includes('FROM scenes WHERE id = $1')) {
      // Main scene query (SELECT id, name, background_url, background_urls, ...).
      return {
        rows: [(globalThis as any).__sceneRow],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };
    }
    if (text.includes('SELECT metadata FROM scenes')) {
      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }
    return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
  });
  return {
    queryOLTP: handler,
    // M19 A1: location.ts scene content reads now route through queryContent,
    // so the mock must serve the same fixture rows on the content pool.
    queryContent: handler,
    queryOLAP: jest.fn(async () => ({ rows: [] })),
    getCache: jest.fn(async (key: string) => cacheStore.get(key) ?? null),
    setCache: jest.fn(async (key: string, val: any) => {
      cacheStore.set(key, val);
      return true;
    }),
    deleteCache: jest.fn(async (key: string) => {
      cacheStore.delete(key);
      return true;
    }),
  };
})());

jest.mock('../../src/routes/location.npcs.js', () => ({
  getOverlayNpcs: jest.fn(async () => []),
  mergeNpcEntries: jest.fn(() => []),
  buildNpcPayload: jest.fn(() => []),
  getSceneRelationships: jest.fn(async () => ({})),
}));

import { assembleScenePayload } from '../../src/routes/location.js';

const SCENE_ID = 'b0000001-0000-4000-8000-000000000099';

const VARIANT_POOL = [
  { url: 'https://cdn.test/plaza__default.png', label: 'production' },
  { url: 'https://cdn.test/plaza__rain.png', label: 'production', variant: 'rain' },
  { url: 'https://cdn.test/plaza__night.png', label: 'production', variant: 'night' },
];

describe('assembleScenePayload — backgroundUrls passthrough', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheStore.clear();
  });

  it('carries the variant-tagged background_urls[] through as scene.backgroundUrls', async () => {
    (globalThis as any).__sceneRow = {
      id: SCENE_ID,
      name: 'Central Plaza',
      background_url: null,
      background_urls: VARIANT_POOL,
      ambient_sound_url: null,
      mood: 'vibrant',
    };

    const payload = await assembleScenePayload(SCENE_ID, '00000000-0000-0000-0000-000000000001');

    expect(payload).not.toBeNull();
    expect(payload!.scene.backgroundUrls).toEqual(VARIANT_POOL);
    // The resolved default still targets the env-appropriate entry.
    expect(payload!.scene.backgroundUrl).toBe('https://cdn.test/plaza__default.png');
  });

  it('orders the pool by the current env stage so the VN layer picks the right variant', async () => {
    // Test NODE_ENV resolves to the `production` priority (production > staging > dev),
    // so the raw dev-first pool must be reordered with the production entry first.
    (globalThis as any).__sceneRow = {
      id: SCENE_ID,
      name: 'Mixed Pool Parking Lot',
      background_url: null,
      background_urls: [
        { url: 'https://cdn.test/dev__rain.png', label: 'dev', variant: 'rain' },
        { url: 'https://cdn.test/prod__rain.png', label: 'production', variant: 'rain' },
        { url: 'https://cdn.test/dev__default.png', label: 'dev' },
      ],
      ambient_sound_url: null,
      mood: 'neutral',
    };

    const payload = await assembleScenePayload(SCENE_ID, '00000000-0000-0000-0000-000000000001');

    expect(payload).not.toBeNull();
    // Map view default resolves the production entry.
    expect(payload!.scene.backgroundUrl).toBe('https://cdn.test/prod__rain.png');
    // VN layer pool is env-ordered: production first, dev last.
    expect(payload!.scene.backgroundUrls).toEqual([
      { url: 'https://cdn.test/prod__rain.png', label: 'production', variant: 'rain' },
      { url: 'https://cdn.test/dev__rain.png', label: 'dev', variant: 'rain' },
      { url: 'https://cdn.test/dev__default.png', label: 'dev' },
    ]);
  });

  it('leaves backgroundUrls undefined when the scene has no background_urls', async () => {
    (globalThis as any).__sceneRow = {
      id: SCENE_ID,
      name: 'Rainy Street Motorcycle',
      background_url: 'https://cdn.test/bg__default.png',
      background_urls: null,
      ambient_sound_url: null,
      mood: 'rain-soaked',
    };

    const payload = await assembleScenePayload(SCENE_ID, '00000000-0000-0000-0000-000000000001');

    expect(payload).not.toBeNull();
    expect(payload!.scene.backgroundUrls).toBeUndefined();
    // Falls back to the plain background_url column.
    expect(payload!.scene.backgroundUrl).toBe('https://cdn.test/bg__default.png');
  });
});
