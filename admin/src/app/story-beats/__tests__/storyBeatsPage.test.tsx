/**
 * UI tests for the Story Beats list page.
 * Ported from dashboard for admin parity.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/navigation', () => ({ useParams: vi.fn() }));

vi.mock('@/lib/client-api', () => ({
  adminFetch: vi.fn(),
}));

import { adminFetch } from '@/lib/client-api';
import StoryBeatsPage from '../page';

const SAMPLE_BEATS = [
  { slug: 'act_1_intro', label: 'Act 1 Intro', order: 1, description: 'The beginning' },
  { slug: 'act_2_rise', label: 'Act 2 Rise', order: 2, description: 'The middle' },
];

function mockFetchReject() {
  return (adminFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
}
function mockFetchFailure(error: string) {
  return (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error });
}

describe('StoryBeatsPage loading and errors', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('shows "Loading beats..." before fetch resolves', async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<StoryBeatsPage />);
    expect(screen.getByText('Loading beats...')).toBeInTheDocument();
  });

  it('shows error box when fetch rejects', async () => {
    mockFetchReject();
    render(<StoryBeatsPage />);
    await waitFor(() => { expect(screen.getByText('Failed to fetch story beats')).toBeInTheDocument(); });
  });

  it('shows error box when fetch returns failure envelope', async () => {
    mockFetchFailure('Invalid slug format');
    render(<StoryBeatsPage />);
    await waitFor(() => { expect(screen.getByText('Invalid slug format')).toBeInTheDocument(); });
  });
});

describe('StoryBeatsPage CRUD operations', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('submitting add form calls POST with correct JSON body', async () => {
    const fetchMock = (adminFetch as ReturnType<typeof vi.fn>);
    fetchMock
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: { slug: 'new_beat', label: 'New Beat', order: 10, description: 'Desc' } })
      .mockResolvedValueOnce({ success: true, data: [{ slug: 'new_beat', label: 'New Beat', order: 10, description: 'Desc' }] });
    render(<StoryBeatsPage />);
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. act_1_intro')).toBeInTheDocument(); });
    await userEvent.type(screen.getByPlaceholderText('e.g. act_1_intro'), 'new_beat');
    await userEvent.type(screen.getByPlaceholderText('Human-readable label'), 'New Beat');
    await userEvent.type(screen.getByPlaceholderText('0'), '10');
    await userEvent.type(screen.getByPlaceholderText('Short description'), 'Desc');
    fireEvent.click(screen.getByText('+ Add Beat'));
    await waitFor(() => {
      const postCall = (fetchMock.mock.calls as [string, RequestInit][]).find(
        ([url, opts]) => url === '/admin/story-beats' && opts?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse((postCall as [string, RequestInit])[1].body as string)).toEqual({ slug: 'new_beat', label: 'New Beat', order: 10, description: 'Desc' });
    });
  });

  it('Edit → Save calls PUT /admin/story-beats/[slug]', async () => {
    const fetchMock = (adminFetch as ReturnType<typeof vi.fn>);
    fetchMock
      .mockResolvedValueOnce({ success: true, data: SAMPLE_BEATS })
      .mockResolvedValueOnce({ success: true, data: SAMPLE_BEATS[0] })
      .mockResolvedValueOnce({ success: true, data: SAMPLE_BEATS });
    render(<StoryBeatsPage />);
    await waitFor(() => { expect(screen.getByText('act_1_intro')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByText('Save')).toBeInTheDocument();
    const labelInputs = screen.getAllByDisplayValue('Act 1 Intro');
    await userEvent.clear(labelInputs[0]);
    await userEvent.type(labelInputs[0], 'Updated Label');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect((fetchMock.mock.calls as [string, RequestInit][]).find(
        ([url, opts]) => typeof url === 'string' && url.includes('/admin/story-beats/act_1_intro') && opts?.method === 'PUT',
      )).toBeDefined();
    });
  });

  it('Delete → confirm → calls DELETE', async () => {
    const fetchMock = (adminFetch as ReturnType<typeof vi.fn>);
    fetchMock
      .mockResolvedValueOnce({ success: true, data: SAMPLE_BEATS })
      .mockResolvedValueOnce({ success: true, data: { slug: 'act_1_intro' } })
      .mockResolvedValueOnce({ success: true, data: [SAMPLE_BEATS[1]] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StoryBeatsPage />);
    await waitFor(() => { expect(screen.getByText('act_1_intro')).toBeInTheDocument(); });
    fireEvent.click(screen.getAllByText('Delete')[0]);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('act_1_intro'));
    await waitFor(() => {
      expect((fetchMock.mock.calls as [string, RequestInit][]).find(
        ([url, opts]) => typeof url === 'string' && url.includes('/admin/story-beats/act_1_intro') && opts?.method === 'DELETE',
      )).toBeDefined();
    });
    confirmSpy.mockRestore();
  });
});
