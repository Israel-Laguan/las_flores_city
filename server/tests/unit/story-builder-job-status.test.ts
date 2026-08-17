/**
 * Unit test for StoryBuilderJobStatus.setJobStatus version-aware CAS.
 *
 * Mocks `@las-flores/infra` (getCache/casSetCache) so no real Redis/DB
 * connection is opened (AGENTS.md rule 7). Drives the retry/owner-mismatch
 * logic by controlling the CAS return code (1 = written, 0 = owner mismatch,
 * 2 = snapshot conflict → retry).
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@las-flores/infra', () => ({
  getCache: jest.fn(),
  casSetCache: jest.fn(),
}));

import { setJobStatus } from '../../src/services/StoryBuilderJobStatus.js';
import { getCache, casSetCache } from '@las-flores/infra';

const mockGetCache = getCache as jest.MockedFunction<typeof getCache>;
const mockCas = casSetCache as jest.MockedFunction<typeof casSetCache>;

const EXISTING = {
  planId: 'p0000000-0000-0000-0000-000000000001',
  status: 'staging',
  version: 'v1',
  runToken: 'mine',
  startedAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
};

describe('StoryBuilderJobStatus.setJobStatus — version CAS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('owner mismatch (code 0) is dropped without retrying', async () => {
    mockGetCache.mockResolvedValue({ ...EXISTING, runToken: 'other' });
    mockCas.mockResolvedValue(0);
    await setJobStatus('p0000000-0000-0000-0000-000000000001', { status: 'staging' }, 'mine');
    expect(mockCas).toHaveBeenCalledTimes(1);
  });

  test('snapshot conflict (code 2) is retried until it succeeds', async () => {
    mockGetCache.mockResolvedValue(EXISTING);
    mockCas.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    await setJobStatus('p0000000-0000-0000-0000-000000000001', { status: 'staging' }, 'mine');
    expect(mockCas).toHaveBeenCalledTimes(2);
  });

  test('gives up after the bounded retry budget on repeated conflicts', async () => {
    mockGetCache.mockResolvedValue(EXISTING);
    mockCas.mockResolvedValue(2);
    await setJobStatus('p0000000-0000-0000-0000-000000000001', { status: 'staging' }, 'mine');
    expect(mockCas.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  test('pending initializer writes unconditionally (init mode)', async () => {
    mockGetCache.mockResolvedValue(null);
    mockCas.mockResolvedValue(1);
    await setJobStatus('p0000000-0000-0000-0000-000000000001', { status: 'pending' }, 'fresh');
    expect(mockCas).toHaveBeenCalledTimes(1);
    const [, , , token, mode] = mockCas.mock.calls[0];
    expect(mode).toBe('init');
    expect(token).toBe('fresh');
  });

  test('passes the read snapshot version into the CAS so conflicts are detected', async () => {
    mockGetCache.mockResolvedValue(EXISTING);
    mockCas.mockResolvedValue(1);
    await setJobStatus('p0000000-0000-0000-0000-000000000001', { status: 'staging' }, 'mine');
    const expectedVersion = mockCas.mock.calls[0][5];
    expect(expectedVersion).toBe('v1');
  });
});
