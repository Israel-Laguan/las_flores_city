import { describe, test, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn(),
}));

jest.mock('../../src/middleware/auth.js', () => ({
  generateToken: jest.fn(() => 'mock-token'),
  authMiddleware: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock('../../src/utils/cookies.js', () => ({
  setSessionCookie: jest.fn(),
  clearSessionCookie: jest.fn(),
}));

jest.mock('../../src/database/repositories/PlayerStateRepository.js', () => ({
  PlayerStateRepository: {
    createForNewUser: jest.fn(),
  },
}));

let handleDevLogin: (req: any, res: any) => Promise<void>;

beforeEach(async () => {
  jest.resetModules();
  const { queryOLTP } = require('../../src/database/connection.js');
  queryOLTP.mockReset();
  const mod = await import('../../src/routes/auth.dev-handlers.js');
  handleDevLogin = mod.handleDevLogin;
});

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('handleDevLogin', () => {
  test('returns 403 with error message when NODE_ENV is production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const req = { body: {} };
    const res = makeRes();

    await handleDevLogin(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Dev login is not available in production',
      timestamp: expect.any(String),
    });
    process.env.NODE_ENV = prev;
  });

  test('does not touch the database when NODE_ENV is production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { queryOLTP } = require('../../src/database/connection.js');
    const req = { body: {} };
    const res = makeRes();

    await handleDevLogin(req as any, res as any);

    expect(queryOLTP).not.toHaveBeenCalled();
    process.env.NODE_ENV = prev;
  });
});
