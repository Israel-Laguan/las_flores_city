import type { AssetListAllResponse } from '@las-flores/shared';
import { API_BASE } from '@/app/assets/constants';

/**
 * Shared API functions for asset management
 */

export async function loadGroups(
  setGroups: (v: AssetListAllResponse['groups']) => void,
  setError?: (v: string | null) => void
): Promise<void> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${API_BASE}/list-all`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.success) {
      setGroups(data.data.groups);
    } else {
      // If there's a setError function, use it to show the error
      if (setError) {
        setError(data.error || 'Failed to load groups');
      }
    }
  } catch (e) {
    console.error('Failed to load groups', e);
    // If there's a setError function, use it to show the error
    if (setError) {
      setError(e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Failed to load groups');
    }
  }
}