import { useRef, useCallback } from 'react';

export function useTrackedFetch() {
  const requestIdRef = useRef(0);

  const withTracking = useCallback(async <T>(
    fetchFn: () => Promise<T>,
    onSuccess: (data: T) => void,
    onError: (error: string) => void,
    onFinally: () => void,
  ) => {
    const requestId = ++requestIdRef.current;
    try {
      const data = await fetchFn();
      if (requestId !== requestIdRef.current) return;
      onSuccess(data);
    } catch {
      if (requestId === requestIdRef.current) onError('Request failed');
    } finally {
      if (requestId === requestIdRef.current) onFinally();
    }
  }, []);

  return { withTracking };
}