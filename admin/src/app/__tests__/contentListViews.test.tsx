/**
 * UI tests for the content list view pages (Dialogues, Scenes, Characters)
 * and their detail pages.
 * Ported from dashboard for admin parity.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/lib/client-api', () => ({
  adminFetch: vi.fn(),
}));

import { useParams } from 'next/navigation';
import { adminFetch } from '@/lib/client-api';

import DialoguesPage from '../dialogues/page';
import ScenesPage from '../scenes/page';
import CharactersPage from '../characters/page';
import DialogueDetailPage from '../dialogues/[id]/page';
import SceneDetailPage from '../scenes/[id]/page';
import CharacterDetailPage from '../characters/[id]/page';
import LocationDetailPage from '../locations/[id]/page';
import AdminNav from '@/components/AdminNav';

beforeEach(() => {
  vi.restoreAllMocks();
  mockPush.mockClear();
  (adminFetch as ReturnType<typeof vi.fn>).mockReset();
  (useParams as ReturnType<typeof vi.fn>).mockReturnValue({});
});

function mockListResponse(items: unknown[], total?: number) {
  const t = total ?? items.length;
  return (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    data: { items, total: t, page: 1, pageSize: 50 },
  });
}

function mockDetailResponse(record: unknown) {
  return (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    data: record,
  });
}

function mockFetchReject() {
  return (adminFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
}

function mockFetch404() {
  return (adminFetch as ReturnType<typeof vi.fn>).mockRejectedValue(
    Object.assign(new Error('API request failed: 404'), { status: 404 }),
  );
}

const SAMPLE_DIALOGUES = [
  { id: 'dlg-uuid-1', name: 'Intro Dialogue', description: 'The opening conversation', nodeCount: 5, beatAssociation: 'act_1_intro', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z' },
  { id: 'dlg-uuid-2', name: 'Market Chat', description: 'A vendor exchange', nodeCount: 3, beatAssociation: null, createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-06-02T00:00:00Z' },
];

const SAMPLE_SCENES = [
  { id: 'scene-uuid-1', name: 'The Plaza', description: 'Central district plaza', district: 'Centro', requiredStoryBeat: 'act_1_intro', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z' },
  { id: 'scene-uuid-2', name: 'Night Market', description: 'Underground commerce hub', district: 'Barrio Bajo', requiredStoryBeat: null, createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-06-02T00:00:00Z' },
];

const SAMPLE_CHARACTERS = [
  { id: 'char-uuid-1', name: 'Carlos Hernandez', title: 'Street Fixer', description: 'A well-connected operative', portraitStatus: 'ready', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z' },
  { id: 'char-uuid-2', name: 'Yuki Tanaka', title: 'Corporate Spy', description: 'Works in the shadows', portraitStatus: 'missing', createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-06-02T00:00:00Z' },
];

describe('DialoguesPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<DialoguesPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    mockFetchReject();
    render(<DialoguesPage />);
    await waitFor(() => { expect(screen.getByText('Failed to fetch Dialogue Trees')).toBeInTheDocument(); });
  });

  it('renders pagination controls when total > pageSize', async () => {
    mockListResponse(SAMPLE_DIALOGUES, 150);
    render(<DialoguesPage />);
    await waitFor(() => { expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument(); });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /dialogues/${id}', async () => {
    mockListResponse(SAMPLE_DIALOGUES);
    render(<DialoguesPage />);
    await waitFor(() => { expect(screen.getByText('Intro Dialogue')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Intro Dialogue'));
    expect(mockPush).toHaveBeenCalledWith('/dialogues/dlg-uuid-1');
  });
});

describe('ScenesPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<ScenesPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    mockFetchReject();
    render(<ScenesPage />);
    await waitFor(() => { expect(screen.getByText('Failed to fetch Scene Browser')).toBeInTheDocument(); });
  });

  it('renders pagination controls when total > pageSize', async () => {
    mockListResponse(SAMPLE_SCENES, 120);
    render(<ScenesPage />);
    await waitFor(() => { expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument(); });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /scenes/${id}', async () => {
    mockListResponse(SAMPLE_SCENES);
    render(<ScenesPage />);
    await waitFor(() => { expect(screen.getByText('The Plaza')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('The Plaza'));
    expect(mockPush).toHaveBeenCalledWith('/scenes/scene-uuid-1');
  });
});

describe('CharactersPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<CharactersPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    mockFetchReject();
    render(<CharactersPage />);
    await waitFor(() => { expect(screen.getByText('Failed to fetch Character Browser')).toBeInTheDocument(); });
  });

  it('renders pagination controls when total > pageSize', async () => {
    mockListResponse(SAMPLE_CHARACTERS, 200);
    render(<CharactersPage />);
    await waitFor(() => { expect(screen.getByText(/Page 1 of 4/)).toBeInTheDocument(); });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /characters/${id}', async () => {
    mockListResponse(SAMPLE_CHARACTERS);
    render(<CharactersPage />);
    await waitFor(() => { expect(screen.getByText('Carlos Hernandez')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Carlos Hernandez'));
    expect(mockPush).toHaveBeenCalledWith('/characters/char-uuid-1');
  });
});

describe('DialogueDetailPage', () => {
  beforeEach(() => { (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'dlg-uuid-1' }); });

  it('shows "Not found." on 404 response', async () => {
    mockFetch404();
    render(<DialogueDetailPage />);
    await waitFor(() => { expect(screen.getByText('Not found.')).toBeInTheDocument(); });
  });

  it('shows "← Back to Dialogues" back link', async () => {
    mockDetailResponse({ id: 'dlg-uuid-1', name: 'Test' });
    render(<DialogueDetailPage />);
    expect(screen.getByText('← Back to Dialogues')).toBeInTheDocument();
  });
});

describe('SceneDetailPage', () => {
  beforeEach(() => { (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'scene-uuid-1' }); });

  it('shows "← Back to Scenes" back link', async () => {
    mockDetailResponse({ id: 'scene-uuid-1', name: 'Test' });
    render(<SceneDetailPage />);
    expect(screen.getByText('← Back to Scenes')).toBeInTheDocument();
  });

  it('shows "Not found." for 404 response', async () => {
    mockFetch404();
    render(<SceneDetailPage />);
    await waitFor(() => { expect(screen.getByText('Not found.')).toBeInTheDocument(); });
  });
});

describe('CharacterDetailPage', () => {
  beforeEach(() => { (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'char-uuid-1' }); });

  it('shows "← Back to Characters" back link', async () => {
    mockDetailResponse({ id: 'char-uuid-1', name: 'Test' });
    render(<CharacterDetailPage />);
    expect(screen.getByText('← Back to Characters')).toBeInTheDocument();
  });

  it('shows "Not found." for 404 response', async () => {
    mockFetch404();
    render(<CharacterDetailPage />);
    await waitFor(() => { expect(screen.getByText('Not found.')).toBeInTheDocument(); });
  });
});

describe('LocationDetailPage', () => {
  beforeEach(() => { (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'loc-uuid-1' }); });

  it('shows "← Back to Locations" back link', async () => {
    mockDetailResponse({ id: 'loc-uuid-1', name: 'Test' });
    render(<LocationDetailPage />);
    expect(screen.getByText('← Back to Locations')).toBeInTheDocument();
  });

  it('shows "Not found." for 404 response', async () => {
    mockFetch404();
    render(<LocationDetailPage />);
    await waitFor(() => { expect(screen.getByText('Not found.')).toBeInTheDocument(); });
  });
});

describe('Nav layout', () => {
  it('layout renders links to /dialogues, /scenes, /characters', () => {
    render(<AdminNav user={{ username: 'tester', role: 'admin' }} />);

    const dialogues = screen.getByRole('link', { name: /Dialogues/i });
    const scenes = screen.getByRole('link', { name: /Scenes/i });
    const characters = screen.getByRole('link', { name: /Characters/i });

    expect(dialogues).toHaveAttribute('href', '/dialogues');
    expect(scenes).toHaveAttribute('href', '/scenes');
    expect(characters).toHaveAttribute('href', '/characters');
  });
});
