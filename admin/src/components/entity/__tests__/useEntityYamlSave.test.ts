import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useEntityYamlSave } from '../useEntityYamlSave';

vi.mock('@/lib/client-api', () => ({
  adminFetch: vi.fn(),
}));

import { adminFetch } from '@/lib/client-api';

describe('useEntityYamlSave', () => {
  beforeEach(() => {
    (adminFetch as ReturnType<typeof vi.fn>).mockReset();
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: { path: 'x', modifiedAt: 'now' } });
  });

  it('save PUTs a stringified YAML and resets state', async () => {
    const { result } = renderHook(() => useEntityYamlSave());
    await act(async () => {
      await result.current.save('characters/x/char_x.yaml', { id: '1', name: 'X' });
    });
    expect(adminFetch).toHaveBeenCalledTimes(1);
    const [, options] = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body as string);
    expect(body.path).toBe('characters/x/char_x.yaml');
    expect(body.content).toContain('name: X');
  });

  it('migrate POSTs to /admin/content/migrate', async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });
    const { result } = renderHook(() => useEntityYamlSave());
    await act(async () => result.current.migrate());
    const [url] = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('/admin/content/migrate');
  });
});
