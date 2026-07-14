/**
 * UI tests for the Beat Detail page.
 * Extracted from page.test.tsx to reduce function length.
 *
 * Task 8.4 — example-based tests.
 * Requirements: 8.1–8.10, 9.5, 9.6
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/navigation', () => ({ useParams: vi.fn() }));

import { useParams } from 'next/navigation';
import BeatDetailPage from '../[slug]/page';

function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: true, data }) });
}
function mockFetchFailure(error: string) {
  return vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success: false, error }) });
}

describe('BeatDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ slug: 'act_1_intro' });
  });

  it('renders "No dialogues set this beat." when dialogueUsages is empty', async () => {
    global.fetch = mockFetchSuccess({ dialogueUsages: [], sceneUsages: [{ sceneId: 'scene-1', sceneName: 'The Plaza' }] });
    render(<BeatDetailPage />);
    await waitFor(() => { expect(screen.getByText('No dialogues set this beat.')).toBeInTheDocument(); });
  });

  it('renders "No scenes require this beat." when sceneUsages is empty', async () => {
    global.fetch = mockFetchSuccess({ dialogueUsages: [{ dialogueId: 'dlg-1', dialogueName: 'Intro Dialogue', nodeId: 'node_0' }], sceneUsages: [] });
    render(<BeatDetailPage />);
    await waitFor(() => { expect(screen.getByText('No scenes require this beat.')).toBeInTheDocument(); });
  });

  it('renders both empty-state messages when both usages arrays are empty', async () => {
    global.fetch = mockFetchSuccess({ dialogueUsages: [], sceneUsages: [] });
    render(<BeatDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No dialogues set this beat.')).toBeInTheDocument();
      expect(screen.getByText('No scenes require this beat.')).toBeInTheDocument();
    });
  });

  it('shows error when fetch returns failure envelope', async () => {
    global.fetch = mockFetchFailure('Beat not found');
    render(<BeatDetailPage />);
    await waitFor(() => { expect(screen.getByText('Beat not found')).toBeInTheDocument(); });
  });
});
