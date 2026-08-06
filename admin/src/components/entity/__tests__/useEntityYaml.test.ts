import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useEntityYaml } from '../useEntityYaml';

vi.mock('@/lib/client-api', () => ({ adminFetch: vi.fn() }));

import { adminFetch } from '@/lib/client-api';

const mockAdminFetch = adminFetch as unknown as ReturnType<typeof vi.fn>;

function resolvedResp(id: string, name: string): unknown {
  return { success: true, data: { path: `dialogues/${id}/d.yml`, yaml: { id, name } } };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('useEntityYaml', () => {
  beforeEach(() => {
    mockAdminFetch.mockReset();
  });

  it('loads the requested entity content', async () => {
    mockAdminFetch.mockResolvedValue(resolvedResp('1', 'A'));
    const { result } = renderHook(() => useEntityYaml('dialogue', '1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.yaml?.id).toBe('1');
    expect(result.current.path).toBe('dialogues/1/d.yml');
  });

  it('discards a stale response that resolves after the id changed', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    mockAdminFetch
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { result, rerender } = renderHook(
      ({ id }) => useEntityYaml('dialogue', id),
      { initialProps: { id: '1' } },
    );

    // Navigate to a different id before the first request resolves — the first
    // request's AbortController is aborted, and its eventual response must be
    // ignored so the previous dialogue can never render under the new URL.
    rerender({ id: '2' });

    await act(async () => { second.resolve(resolvedResp('2', 'B')); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.yaml?.id).toBe('2');

    // The stale id=1 response arrives late — it must not overwrite id=2.
    await act(async () => { first.resolve(resolvedResp('1', 'A')); });
    expect(result.current.yaml?.id).toBe('2');
    expect(result.current.path).toBe('dialogues/2/d.yml');
  });
});
