/**
 * Integration tests for GET /admin/locations/:id (Plan 02).
 *
 * Locations are not a dedicated table — they are `scenes` rows tagged with
 * `metadata->>'type' = 'location'` (migrated from
 * `content/districts/<district>/locations/<slug>/location_<slug>.yaml`).
 *
 * Verifies:
 * - 200 + row data when a tagged location scene exists
 * - 404 when no scene matches (non-location id or missing id)
 * - the SQL filters by `metadata->>'type' = 'location'`
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] })),
  queryOLAP: jest.fn(async () => ({ rows: [] })),
}));

jest.mock('../../src/middleware/adminAuth.js', () => ({
  authAndAdminMiddleware: (_req: any, _res: any, next: any) => {
    _req.userId = '00000000-0000-0000-0000-000000000001';
    next();
  },
}));

import { adminListViewsRouter } from '../../src/routes/admin-list-views.js';
import { queryOLTP } from '../../src/database/connection.js';

const mockQueryOLTP = queryOLTP as jest.MockedFunction<typeof queryOLTP>;

const LOCATION_ID = 'b0000001-0000-4000-8000-000000000001';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminListViewsRouter);
  return app;
}

describe('GET /admin/locations/:id', () => {
  const app = makeApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with the location scene row when metadata type is location', async () => {
    const row = {
      id: LOCATION_ID,
      name: 'Aeropuerto Internacional de Las Flores',
      description: 'The primary gateway for international travel.',
      district_id: 'd-southeast',
      metadata: {
        type: 'location',
        district: 'Southeast',
        tags: ['Landmark', 'Airport', 'Transport'],
        lore_path: 'aeropuerto_internacional_de_las_flores.md',
        asset_paths: { image: 'aeropuerto_internacional_de_las_flores__default.png' },
      },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
    };
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [row],
      rowCount: 1,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const res = await request(app).get(`/admin/locations/${LOCATION_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(LOCATION_ID);
    expect(res.body.data.name).toBe('Aeropuerto Internacional de Las Flores');
    expect(res.body.data.metadata.type).toBe('location');

    // The handler must filter by metadata->>'type' = 'location' and bind $1 = id
    const [sql, params] = mockQueryOLTP.mock.calls[0] as [string, unknown[]];
    expect(String(sql)).toContain("metadata->>'type' = 'location'");
    expect(params).toEqual([LOCATION_ID]);
  });

  it('returns 404 when no scene row matches (non-location or missing id)', async () => {
    mockQueryOLTP.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
      command: 'SELECT',
      oid: 0,
      fields: [],
    } as any);

    const res = await request(app).get(`/admin/locations/${LOCATION_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Location not found/);
  });
});