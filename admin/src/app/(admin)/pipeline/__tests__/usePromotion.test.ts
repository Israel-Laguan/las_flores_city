import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePromotion } from '../hooks/usePromotion';

const mockPromotion = {
  fetchPromotionStatus: vi.fn(),
  promoteStaging: vi.fn(),
  promoteProduction: vi.fn(),
  rollbackStaging: vi.fn(),
};

vi.mock('@/lib/promotion', () => ({
  fetchPromotionStatus: (...args: unknown[]) => mockPromotion.fetchPromotionStatus(...args),
  promoteStaging: (...args: unknown[]) => mockPromotion.promoteStaging(...args),
  promoteProduction: (...args: unknown[]) => mockPromotion.promoteProduction(...args),
  rollbackStaging: (...args: unknown[]) => mockPromotion.rollbackStaging(...args),
}));

describe('usePromotion', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('fetchPromotionStatus loads statuses', async () => {
    const mockStatuses = [{ contentPath: 'characters/test', stages: { dev: { url: 'x' } } }];
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce(mockStatuses);
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.fetchPromotionStatus(); });
    await waitFor(() => expect(result.current.promotionStatuses.length).toBeGreaterThan(0));
    expect(result.current.promotionLoading).toBe(false);
  });

  it('promoteStaging calls API and refreshes status', async () => {
    mockPromotion.promoteStaging.mockResolvedValueOnce(undefined);
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.promoteStaging('characters/test'); });
    expect(mockPromotion.promoteStaging).toHaveBeenCalledWith('characters/test');
    expect(mockPromotion.fetchPromotionStatus).toHaveBeenCalled();
    expect(result.current.publishing).toBe(false);
    expect(result.current.publishError).toBeNull();
  });

  it('promoteStaging sets error on failure', async () => {
    mockPromotion.promoteStaging.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.promoteStaging('characters/test'); });
    expect(result.current.publishError).toBe('Failed to promote to staging');
    expect(result.current.publishing).toBe(false);
  });

  it('promoteProduction calls API and refreshes status', async () => {
    mockPromotion.promoteProduction.mockResolvedValueOnce(undefined);
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.promoteProduction('characters/test'); });
    expect(mockPromotion.promoteProduction).toHaveBeenCalledWith('characters/test');
    expect(mockPromotion.fetchPromotionStatus).toHaveBeenCalled();
    expect(result.current.publishing).toBe(false);
  });

  it('promoteProduction sets error on failure', async () => {
    mockPromotion.promoteProduction.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.promoteProduction('characters/test'); });
    expect(result.current.publishError).toBe('Failed to promote to production');
  });

  it('rollbackStaging calls API and refreshes status', async () => {
    mockPromotion.rollbackStaging.mockResolvedValueOnce(undefined);
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.rollbackStaging('characters/test'); });
    expect(mockPromotion.rollbackStaging).toHaveBeenCalledWith('characters/test');
    expect(mockPromotion.fetchPromotionStatus).toHaveBeenCalled();
    expect(result.current.publishing).toBe(false);
  });

  it('rollbackStaging sets error on failure', async () => {
    mockPromotion.rollbackStaging.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.rollbackStaging('characters/test'); });
    expect(result.current.publishError).toBe('Failed to rollback staging');
  });

  it('runPublish promotes to staging then production for each dev-only item', async () => {
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([
      { contentPath: 'characters/test', stages: { dev: { url: 'x' }, staging: null, production: null } },
    ]);
    mockPromotion.promoteStaging.mockResolvedValueOnce(undefined);
    mockPromotion.promoteProduction.mockResolvedValueOnce(undefined);
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.fetchPromotionStatus(); });
    await waitFor(() => expect(result.current.promotionStatuses.length).toBe(1));
    await act(async () => { result.current.runPublish(); });
    expect(mockPromotion.promoteStaging).toHaveBeenCalled();
    expect(mockPromotion.promoteProduction).toHaveBeenCalled();
    expect(result.current.publishing).toBe(false);
  });

  it('runPublish skips staging if already staged', async () => {
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([
      { contentPath: 'characters/test', stages: { dev: { url: 'x' }, staging: { url: 'y' }, production: null } },
    ]);
    mockPromotion.promoteProduction.mockResolvedValueOnce(undefined);
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.fetchPromotionStatus(); });
    await waitFor(() => expect(result.current.promotionStatuses.length).toBe(1));
    await act(async () => { result.current.runPublish(); });
    expect(mockPromotion.promoteStaging).not.toHaveBeenCalled();
    expect(mockPromotion.promoteProduction).toHaveBeenCalled();
  });

  it('runPublish sets error on failure', async () => {
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([
      { contentPath: 'characters/test', stages: { dev: { url: 'x' }, staging: null, production: null } },
    ]);
    mockPromotion.promoteStaging.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.fetchPromotionStatus(); });
    await waitFor(() => expect(result.current.promotionStatuses.length).toBe(1));
    await act(async () => { result.current.runPublish(); });
    expect(result.current.publishError).toContain('Publish completed with 1 error(s)');
    expect(result.current.publishError).toContain('Failed to promote characters/test: fail');
    expect(result.current.publishing).toBe(false);
  });

  it('runPublish continues promoting remaining assets after an error', async () => {
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([
      { contentPath: 'characters/first', stages: { dev: { url: 'x' }, staging: null, production: null } },
      { contentPath: 'characters/second', stages: { dev: { url: 'y' }, staging: null, production: null } },
    ]);
    // First asset's staging fails, second succeeds
    mockPromotion.promoteStaging
      .mockRejectedValueOnce(new Error('staging fail'))
      .mockResolvedValueOnce(undefined);
    // Production succeeds for all calls
    mockPromotion.promoteProduction.mockResolvedValue(undefined);
    mockPromotion.fetchPromotionStatus.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.fetchPromotionStatus(); });
    await waitFor(() => expect(result.current.promotionStatuses.length).toBe(2));
    await act(async () => { result.current.runPublish(); });
    // Both assets were attempted for staging
    expect(mockPromotion.promoteStaging).toHaveBeenCalledTimes(2);
    // Production was called only for the second asset (first failed at staging)
    expect(mockPromotion.promoteProduction).toHaveBeenCalledTimes(1);
    expect(mockPromotion.promoteProduction).toHaveBeenCalledWith('characters/second');
    // Error was reported with the first asset's failure
    expect(result.current.publishError).toContain('Failed to promote characters/first');
    expect(result.current.publishing).toBe(false);
  });

  it('fetchPromotionStatus sets promotionError on failure', async () => {
    mockPromotion.fetchPromotionStatus.mockRejectedValueOnce(new Error('network error'));
    const { result } = renderHook(() => usePromotion());
    await act(async () => { result.current.fetchPromotionStatus(); });
    expect(result.current.promotionError).toBe('Failed to fetch promotion status');
    expect(result.current.promotionLoading).toBe(false);
  });
});
