/**
 * UI tests for the Beat Detail page.
 * Ported from dashboard for admin parity.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/navigation', () => ({ useParams: vi.fn() }));

vi.mock('@/lib/client-api', () => ({
  adminFetch: vi.fn(),
}));

import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/client-api';
import BeatDetailPage from '../[slug]/page';

function mockFetchSuccess(data: unknown) {
  return (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data });
}
function mockFetchFailure(error: string) {
  return (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error });
}

describe('BeatDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ slug: 'act_1_intro' });
  });

  it('renders "No dialogues set this beat." when dialogueUsages is empty', async () => {
    mockFetchSuccess({ dialogueUsages: [], sceneUsages: [{ sceneId: 'scene-1', sceneName: 'The Plaza' }] });
    render(<BeatDetailPage />);
    await waitFor(() => { expect(screen.getByText('No dialogues set this beat.')).toBeInTheDocument(); });
  });

  it('renders "No scenes require this beat." when sceneUsages is empty', async () => {
    mockFetchSuccess({ dialogueUsages: [{ dialogueId: 'dlg-1', dialogueName: 'Intro Dialogue', nodeId: 'node_0' }], sceneUsages: [] });
    render(<BeatDetailPage />);
    await waitFor(() => { expect(screen.getByText('No scenes require this beat.')).toBeInTheDocument(); });
  });

  it('renders both empty-state messages when both usages arrays are empty', async () => {
    mockFetchSuccess({ dialogueUsages: [], sceneUsages: [] });
    render(<BeatDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No dialogues set this beat.')).toBeInTheDocument();
      expect(screen.getByText('No scenes require this beat.')).toBeInTheDocument();
    });
  });

  it('shows error when fetch returns failure envelope', async () => {
    mockFetchFailure('Beat not found');
    render(<BeatDetailPage />);
    await waitFor(() => { expect(screen.getByText('Beat not found')).toBeInTheDocument(); });
  });
});
