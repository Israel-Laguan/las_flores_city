import { describe, test, expect, beforeEach, jest, beforeAll } from '@jest/globals';

// ============================================================
// createRateLimiter Unit Tests (Task 5.2 Foundations)
//
// Mocks the redis client so no real Redis connection is needed.
// Tests the three contract points:
//   1. Passes through (calls next) when under the limit
//   2. Returns 429 with Retry-After when over the limit
//   3. Fails open (calls next) when Redis throws
// ============================================================

// Mock the redis module BEFORE importing the limiter. jest.mock is
// hoisted by Jest so it runs before the dynamic import in beforeAll.
const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
};

jest.mock('../../src/database/redis.js', () => ({
  redis: mockRedis,
}));

// Import inside beforeAll so the mock is registered first. Top-level
// await is not supported in this Jest ESM config, but beforeAll is async.
let createRateLimiter: (config: any) => any;

beforeAll(async () => {
  const mod = await import('../../src/middleware/rateLimiter.js');
  createRateLimiter = mod.createRateLimiter;
});

// Minimal Express-like stubs. We don't need real Express — just the
// three properties the middleware touches (path, userId, ip) and the
// res.status().json() chain.
function makeReq(overrides: any = {}) {
  return {
    path: '/test',
    userId: undefined,
    ip: '127.0.0.1',
    ...overrides,
  };
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('createRateLimiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes through (calls next) when under the limit', async () => {
    mockRedis.incr.mockResolvedValue(1);   // first request
    mockRedis.expire.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('test:'));
  });

  test('sets expire only on the first request in a window', async () => {
    mockRedis.incr.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.expire).toHaveBeenCalledTimes(1);
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  test('does NOT call expire on subsequent requests in the window', async () => {
    mockRedis.incr.mockResolvedValue(2);  // second request

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.expire).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns 429 with Retry-After when limit exceeded', async () => {
    mockRedis.incr.mockResolvedValue(4);   // over the limit of 3
    mockRedis.ttl.mockResolvedValue(45);   // 45 seconds remaining in window

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '45');
    expect(res.json).toHaveBeenCalledWith({ error: 'TOO_MANY_REQUESTS' });
    expect(mockRedis.ttl).toHaveBeenCalledTimes(1);
  });

  test('uses default Retry-After of windowSeconds when TTL returns -1 (expired/no key)', async () => {
    mockRedis.incr.mockResolvedValue(4);
    mockRedis.ttl.mockResolvedValue(-1);   // key has no TTL (expired or missing)

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '60');
  });

  test('falls back to req.ip when userId is absent (unauthenticated routes)', async () => {
    mockRedis.incr.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'anon' });
    const req = makeReq({ userId: undefined, ip: '203.0.113.5' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('anon:/test:203.0.113.5'));
  });

  test('fails open (calls next) when Redis throws', async () => {
    mockRedis.incr.mockRejectedValue(new Error('Redis connection refused'));

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3, keyPrefix: 'test' });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    // Fail open: gameplay must not break because Redis is down.
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('uses default keyPrefix "rl" when none provided', async () => {
    mockRedis.incr.mockResolvedValue(1);

    const limiter = createRateLimiter({ windowSeconds: 60, maxRequests: 3 });
    const req = makeReq({ userId: 'user-1' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req as any, res as any, next as any);

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('rl:'));
  });
});
