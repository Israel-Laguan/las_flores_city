import { test, expect } from '@jest/globals';

test('mock fetch works', async () => {
  const original = (global as any).fetch;
  (global as any).fetch = jest.fn().mockResolvedValue({ status: 200, arrayBuffer: async () => Buffer.from('test').buffer });
  const res = await fetch('http://example.test');
  expect(res.status).toBe(200);
  (global as any).fetch = original;
});
