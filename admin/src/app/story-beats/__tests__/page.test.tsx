/**
 * UI tests for the Story Beats admin pages.
 * Tasks 8.1 and 8.4 — example-based tests.
 * Requirements: 8.1–8.10, 9.5, 9.6
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// ── Mock next/navigation so BeatDetailPage's useParams() works in jsdom ──────
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
}));

import { useParams } from 'next/navigation';
import StoryBeatsPage from '../page';
import BeatDetailPage from '../[slug]/page';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAMPLE_BEATS = [
  { slug: 'act_1_intro', label: 'Act 1 Intro', order: 1, description: 'The beginning' },
  { slug: 'act_2_rise', label: 'Act 2 Rise', order: 2, description: 'The middle' },
];

/**
 * Create a fetch mock that resolves immediately with a success payload.
 */
function mockFetchSuccess(data: unknown, extra?: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ success: true, data, ...extra }),
  });
}

/**
 * Create a fetch mock that rejects (network error).
 */
function mockFetchReject() {
  return vi.fn().mockRejectedValue(new Error('network error'));
}

/**
 * Create a fetch mock that returns a failure envelope.
 */
function mockFetchFailure(error: string) {
  return vi.fn().mockResolvedValue({
    json: () => Promise.resolve({ success: false, error }),
  });
}

// ── StoryBeatsPage tests ──────────────────────────────────────────────────────

describe('StoryBeatsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 8.4 test 1: Loading state ─────────────────────────────────────────────
  it('shows "Loading beats..." before fetch resolves', async () => {
    // Fetch never resolves during this test
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<StoryBeatsPage />);

    expect(screen.getByText('Loading beats...')).toBeInTheDocument();
  });

  // ── 8.4 test 2: Error state ───────────────────────────────────────────────
  it('shows error box when fetch rejects', async () => {
    global.fetch = mockFetchReject();

    render(<StoryBeatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch story beats')).toBeInTheDocument();
    });
  });

  // ── 8.4 test 3: Add form POST ─────────────────────────────────────────────
  it('submitting add form calls POST /api/admin/story-beats with correct JSON body', async () => {
    // First call (initial load) returns empty list; second call (after add) returns new beat
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [] }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { slug: 'new_beat', label: 'New Beat', order: 10, description: 'Desc' } }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [{ slug: 'new_beat', label: 'New Beat', order: 10, description: 'Desc' }] }) });

    global.fetch = fetchMock;

    render(<StoryBeatsPage />);

    // Wait for initial load to finish
    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. act_1_intro')).toBeInTheDocument();
    });

    // Fill in the form
    await userEvent.type(screen.getByPlaceholderText('e.g. act_1_intro'), 'new_beat');
    await userEvent.type(screen.getByPlaceholderText('Human-readable label'), 'New Beat');
    await userEvent.type(screen.getByPlaceholderText('0'), '10');
    await userEvent.type(screen.getByPlaceholderText('Short description'), 'Desc');

    // Submit
    fireEvent.click(screen.getByText('+ Add Beat'));

    await waitFor(() => {
      // Find the POST call
      const postCall = fetchMock.mock.calls.find(
        ([url, opts]) => url === '/api/admin/story-beats' && opts?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body as string);
      expect(body).toEqual({ slug: 'new_beat', label: 'New Beat', order: 10, description: 'Desc' });
    });
  });

  // ── 8.4 test 4: Edit → Save calls PUT ────────────────────────────────────
  it('clicking Edit replaces cells with inputs; submitting Save calls PUT /api/admin/story-beats/[slug]', async () => {
    const fetchMock = vi
      .fn()
      // initial GET
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: SAMPLE_BEATS }) })
      // PUT response
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: SAMPLE_BEATS[0] }) })
      // re-fetch after save
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: SAMPLE_BEATS }) });

    global.fetch = fetchMock;

    render(<StoryBeatsPage />);

    // Wait for table to render
    await waitFor(() => {
      expect(screen.getByText('act_1_intro')).toBeInTheDocument();
    });

    // Click Edit on the first row
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    // Row should now have inputs — check for Save button
    expect(screen.getByText('Save')).toBeInTheDocument();

    // Change the label input
    const labelInputs = screen.getAllByDisplayValue('Act 1 Intro');
    await userEvent.clear(labelInputs[0]);
    await userEvent.type(labelInputs[0], 'Updated Label');

    // Submit Save
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/api/admin/story-beats/act_1_intro') &&
          opts?.method === 'PUT',
      );
      expect(putCall).toBeDefined();
    });
  });

  // ── 8.4 test 5: Delete → confirm → DELETE call ───────────────────────────
  it('clicking Delete shows window.confirm; confirming calls DELETE /api/admin/story-beats/[slug]', async () => {
    const fetchMock = vi
      .fn()
      // initial GET
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: SAMPLE_BEATS }) })
      // DELETE response
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: { slug: 'act_1_intro' } }) })
      // re-fetch after delete
      .mockResolvedValueOnce({ json: () => Promise.resolve({ success: true, data: [SAMPLE_BEATS[1]] }) });

    global.fetch = fetchMock;

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<StoryBeatsPage />);

    await waitFor(() => {
      expect(screen.getByText('act_1_intro')).toBeInTheDocument();
    });

    // Click Delete on the first row
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    // confirm should have been called
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('act_1_intro'),
    );

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([url, opts]) =>
          typeof url === 'string' &&
          url.includes('/api/admin/story-beats/act_1_intro') &&
          opts?.method === 'DELETE',
      );
      expect(deleteCall).toBeDefined();
    });

    confirmSpy.mockRestore();
  });
});

// ── BeatDetailPage tests ──────────────────────────────────────────────────────

describe('BeatDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default useParams mock
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ slug: 'act_1_intro' });
  });

  // ── 8.4 test 6: empty dialogueUsages ─────────────────────────────────────
  it('renders "No dialogues set this beat." when dialogueUsages is empty', async () => {
    global.fetch = mockFetchSuccess({
      dialogueUsages: [],
      sceneUsages: [{ sceneId: 'scene-1', sceneName: 'The Plaza' }],
    });

    render(<BeatDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('No dialogues set this beat.')).toBeInTheDocument();
    });
  });

  // ── 8.4 test 7: empty sceneUsages ────────────────────────────────────────
  it('renders "No scenes require this beat." when sceneUsages is empty', async () => {
    global.fetch = mockFetchSuccess({
      dialogueUsages: [
        { dialogueId: 'dlg-1', dialogueName: 'Intro Dialogue', nodeId: 'node_0' },
      ],
      sceneUsages: [],
    });

    render(<BeatDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('No scenes require this beat.')).toBeInTheDocument();
    });
  });

  // ── bonus: both empty ────────────────────────────────────────────────────
  it('renders both empty-state messages when both usages arrays are empty', async () => {
    global.fetch = mockFetchSuccess({ dialogueUsages: [], sceneUsages: [] });

    render(<BeatDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('No dialogues set this beat.')).toBeInTheDocument();
      expect(screen.getByText('No scenes require this beat.')).toBeInTheDocument();
    });
  });
});
