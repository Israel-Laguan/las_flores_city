import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePipeline } from '../hooks/usePipeline';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/client-api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

describe('usePipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts on edit step (index 0)', () => {
    const { result } = renderHook(() => usePipeline());
    expect(result.current.currentStepIdx).toBe(0);
    expect(result.current.currentStep).toBe('edit');
  });

  it('goNext advances step', () => {
    const { result } = renderHook(() => usePipeline());
    act(() => result.current.goNext());
    expect(result.current.currentStepIdx).toBe(1);
  });

  it('goBack decrements step', () => {
    const { result } = renderHook(() => usePipeline());
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.currentStepIdx).toBe(2);
    act(() => result.current.goBack());
    expect(result.current.currentStepIdx).toBe(1);
  });

  it('goBack does not go below 0', () => {
    const { result } = renderHook(() => usePipeline());
    act(() => result.current.goBack());
    expect(result.current.currentStepIdx).toBe(0);
  });

  it('goNext does not exceed last step', () => {
    const { result } = renderHook(() => usePipeline());
    for (let i = 0; i < 10; i++) act(() => result.current.goNext());
    expect(result.current.currentStepIdx).toBe(4);
  });

  it('goToStep navigates forward by one step at a time', () => {
    const { result } = renderHook(() => usePipeline());
    act(() => result.current.goToStep(1));
    expect(result.current.currentStepIdx).toBe(1);
    act(() => result.current.goToStep(2));
    expect(result.current.currentStepIdx).toBe(2);
  });

  it('goToStep does not skip past current+1', () => {
    const { result } = renderHook(() => usePipeline());
    act(() => result.current.goToStep(3));
    expect(result.current.currentStepIdx).toBe(0);
  });

  describe('validation', () => {
    it('runValidation fetches and stores result', async () => {
      mockAdminFetch.mockResolvedValueOnce({
        success: true,
        data: { valid: true, errors: [], warnings: [] },
      });
      const { result } = renderHook(() => usePipeline());
      await act(async () => { result.current.runValidation(); });
      await waitFor(() => expect(result.current.validationResult).not.toBeNull());
      expect(result.current.validationResult?.valid).toBe(true);
      expect(mockAdminFetch).toHaveBeenCalledWith('/admin/content/validate', { method: 'POST' });
    });

    it('canProceed blocks validation errors', async () => {
      mockAdminFetch.mockResolvedValueOnce({
        success: true,
        data: { valid: false, errors: [{ file: 'x.yaml', message: 'Bad', severity: 'error' }], warnings: [] },
      });
      const { result } = renderHook(() => usePipeline());
      act(() => result.current.goNext());
      await act(async () => { result.current.runValidation(); });
      await waitFor(() => expect(result.current.hasValidationErrors).toBe(true));
      expect(result.current.canProceed).toBe(false);
    });

    it('canProceed allows valid passes', async () => {
      mockAdminFetch.mockResolvedValueOnce({
        success: true,
        data: { valid: true, errors: [], warnings: [] },
      });
      const { result } = renderHook(() => usePipeline());
      act(() => result.current.goNext());
      await act(async () => { result.current.runValidation(); });
      await waitFor(() => expect(result.current.validationResult?.valid).toBe(true));
      expect(result.current.hasValidationErrors).toBe(false);
      expect(result.current.canProceed).toBe(true);
    });

    it('handles network error gracefully', async () => {
      mockAdminFetch.mockRejectedValueOnce(new Error('Network failure'));
      const { result } = renderHook(() => usePipeline());
      await act(async () => { result.current.runValidation(); });
      await waitFor(() => expect(result.current.validationError).toBe('Network error during validation'));
      expect(result.current.validating).toBe(false);
    });
  });

  describe('migration', () => {
     it('runMigration calls endpoint and updates status', async () => {
       mockAdminFetch
         .mockResolvedValueOnce({
           success: true,
           data: { success: true, filesProcessed: 3, filesSkipped: 0, filesFailed: 0, errors: [], appliedMigrations: [] },
         })
         .mockResolvedValueOnce({
           success: true,
           data: { totalFiles: 3, byType: {}, files: [] },
         });
       const { result } = renderHook(() => usePipeline());
       await act(async () => { result.current.runMigration(); });
       await waitFor(() => expect(result.current.migrationResult).not.toBeNull());
       expect(result.current.migrationResult?.success).toBe(true);
       expect(mockAdminFetch).toHaveBeenCalledWith('/admin/content/migrate', { method: 'POST' });
       expect(mockAdminFetch).toHaveBeenCalledWith('/admin/content/status');
       expect(result.current.migrationStatus).not.toBeNull();
     });
   });

  describe('promotion', () => {
    it('fetchPromotionStatus loads statuses', async () => {
      const mockStatuses = [
        { contentPath: 'characters/test', name: 'Test', slug: 'test', stages: { dev: { url: 'x' } } },
      ];
      mockAdminFetch.mockResolvedValueOnce({ success: true, data: mockStatuses });
      const { result } = renderHook(() => usePipeline());
      await act(async () => { result.current.fetchPromotionStatus(); });
      await waitFor(() => expect(result.current.promotionStatuses.length).toBeGreaterThan(0));
      expect(result.current.promotionLoading).toBe(false);
    });
  });
});
