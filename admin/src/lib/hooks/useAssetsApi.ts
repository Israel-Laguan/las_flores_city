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
    const res = await fetch(`${API_BASE}/list-all`);
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
      setError('Failed to load groups');
    }
  }
}