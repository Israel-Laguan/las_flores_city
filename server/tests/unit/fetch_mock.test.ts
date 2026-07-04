import { test, expect, beforeAll, afterAll } from '@jest/globals';

test('mock fetch works', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    ok: true,
    arrayBuffer: async () => Buffer.from('test').buffer,
    text: async () => 'mock text',
  });
  
  try {
    const res = await fetch('http://example.test');
    expect(res.status).toBe(200);
  } finally {
    global.fetch = originalFetch;
  }
});
