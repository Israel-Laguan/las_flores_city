import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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
    expect(result.current.saving).toBe(false);
    expect(result.current.success).toBe(false);
    expect(result.current.error).toBeNull();
    await act(async () => {
      await result.current.save('characters/x/char_x.yaml', { id: '1', name: 'X' });
    });
    expect(adminFetch).toHaveBeenCalledTimes(1);
    const [url, options] = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/admin/content/file');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body as string);
    expect(body.path).toBe('characters/x/char_x.yaml');
    expect(body.content).toContain('name: X');
    expect(result.current.saving).toBe(false);
    expect(result.current.success).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('migrate POSTs to /admin/content/migrate', async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} });
    const { result } = renderHook(() => useEntityYamlSave());
    await act(async () => result.current.migrate());
    const [url, options] = (adminFetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/admin/content/migrate');
    expect(options.method).toBe('POST');
  });
});
