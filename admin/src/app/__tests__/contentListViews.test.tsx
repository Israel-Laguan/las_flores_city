/**
 * UI tests for the content list view pages (Dialogues, Scenes, Characters)
 * and their detail pages.
 *
 * Tasks 11.2–11.4
 * Requirements: 6.1–9.8
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import '@testing-library/jest-dom';

// ── Mock next/navigation so detail pages' useParams() and list pages' useRouter() work in jsdom ─────────
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: () => ({ push: mockPush }),
}));

import { useParams } from 'next/navigation';

// ── Page imports ──────────────────────────────────────────────────────────────
import DialoguesPage from '../dialogues/page';
import ScenesPage from '../scenes/page';
import CharactersPage from '../characters/page';
import DialogueDetailPage from '../dialogues/[id]/page';
import SceneDetailPage from '../scenes/[id]/page';
import CharacterDetailPage from '../characters/[id]/page';

// ── Global fetch mock ─────────────────────────────────────────────────────────
beforeEach(() => {
  vi.restoreAllMocks();
  mockPush.mockClear();
  global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
  (useParams as ReturnType<typeof vi.fn>).mockReturnValue({});
});

// ── Shared helpers ─────────────────────────────────────────────────────────────

function mockListResponse(items: unknown[], total?: number) {
  const t = total ?? items.length;
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: { items, total: t, page: 1, pageSize: 50 } }),
  });
}

function mockDetailResponse(record: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: record }),
  });
}

function mockFetchReject() {
  return vi.fn().mockRejectedValue(new Error('network error'));
}

function mockFetch404() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ success: false, error: 'Not found' }),
  });
}

// ── Sample fixture data ───────────────────────────────────────────────────────

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

// ── Dialogues list page tests ─────────────────────────────────────────────────

describe('DialoguesPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    render(<DialoguesPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    global.fetch = mockFetchReject();
    render(<DialoguesPage />);
    await waitFor(() => { expect(screen.getByText('Failed to fetch Dialogue Trees')).toBeInTheDocument(); });
  });

  it('renders pagination controls when total > pageSize', async () => {
    global.fetch = mockListResponse(SAMPLE_DIALOGUES, 150);
    render(<DialoguesPage />);
    await waitFor(() => { expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument(); });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /dialogues/${id}', async () => {
    global.fetch = mockListResponse(SAMPLE_DIALOGUES);
    render(<DialoguesPage />);
    await waitFor(() => { expect(screen.getByText('Intro Dialogue')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Intro Dialogue'));
    expect(mockPush).toHaveBeenCalledWith('/dialogues/dlg-uuid-1');
  });
});

// ── Scenes list page tests ────────────────────────────────────────────────────

describe('ScenesPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    render(<ScenesPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    global.fetch = mockFetchReject();
    render(<ScenesPage />);
    await waitFor(() => { expect(screen.getByText('Failed to fetch Scene Browser')).toBeInTheDocument(); });
  });

  it('renders pagination controls when total > pageSize', async () => {
    global.fetch = mockListResponse(SAMPLE_SCENES, 120);
    render(<ScenesPage />);
    await waitFor(() => { expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument(); });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /scenes/${id}', async () => {
    global.fetch = mockListResponse(SAMPLE_SCENES);
    render(<ScenesPage />);
    await waitFor(() => { expect(screen.getByText('The Plaza')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('The Plaza'));
    expect(mockPush).toHaveBeenCalledWith('/scenes/scene-uuid-1');
  });
});

// ── Characters list page tests ────────────────────────────────────────────────

describe('CharactersPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    render(<CharactersPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    global.fetch = mockFetchReject();
    render(<CharactersPage />);
    await waitFor(() => { expect(screen.getByText('Failed to fetch Character Browser')).toBeInTheDocument(); });
  });

  it('renders pagination controls when total > pageSize', async () => {
    global.fetch = mockListResponse(SAMPLE_CHARACTERS, 200);
    render(<CharactersPage />);
    await waitFor(() => { expect(screen.getByText(/Page 1 of 4/)).toBeInTheDocument(); });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /characters/${id}', async () => {
    global.fetch = mockListResponse(SAMPLE_CHARACTERS);
    render(<CharactersPage />);
    await waitFor(() => { expect(screen.getByText('Carlos Hernandez')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Carlos Hernandez'));
    expect(mockPush).toHaveBeenCalledWith('/characters/char-uuid-1');
  });
});

// ── Detail page tests ─────────────────────────────────────────────────────────

describe('DialogueDetailPage', () => {
  beforeEach(() => { (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'dlg-uuid-1' }); });

  it('shows "Not found." on 404 response', async () => {
    global.fetch = mockFetch404();
    render(<DialogueDetailPage />);
    await waitFor(() => { expect(screen.getByText('Not found.')).toBeInTheDocument(); });
  });

  it('shows "← Back to Dialogues" back link', async () => {
    global.fetch = mockDetailResponse({ id: 'dlg-uuid-1', name: 'Test' });
    render(<DialogueDetailPage />);
    expect(screen.getByText('← Back to Dialogues')).toBeInTheDocument();
  });
});

describe('SceneDetailPage', () => {
  beforeEach(() => { (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'scene-uuid-1' }); });

  it('shows "← Back to Scenes" back link', async () => {
    global.fetch = mockDetailResponse({ id: 'scene-uuid-1', name: 'Test' });
    render(<SceneDetailPage />);
    expect(screen.getByText('← Back to Scenes')).toBeInTheDocument();
  });

  it('shows "Not found." for 404 response', async () => {
    global.fetch = mockFetch404();
    render(<SceneDetailPage />);
    await waitFor(() => { expect(screen.getByText('Not found.')).toBeInTheDocument(); });
  });
});

describe('CharacterDetailPage', () => {
  beforeEach(() => { (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'char-uuid-1' }); });

  it('shows "← Back to Characters" back link', async () => {
    global.fetch = mockDetailResponse({ id: 'char-uuid-1', name: 'Test' });
    render(<CharacterDetailPage />);
    expect(screen.getByText('← Back to Characters')).toBeInTheDocument();
  });

  it('shows "Not found." for 404 response', async () => {
    global.fetch = mockFetch404();
    render(<CharacterDetailPage />);
    await waitFor(() => { expect(screen.getByText('Not found.')).toBeInTheDocument(); });
  });
});

// Nav test — skipped: testing Next.js root layouts in jsdom is complex
describe('Nav layout', () => {
  it.todo('layout renders links to /dialogues, /scenes, /characters');
});

// ── Detail page field display — P6 ────────────────────────────────────────────
// Validates: Requirements 9.1, 9.2, 9.3, 9.5

const flatRecordArb = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9]{1,14}$/),
  fc.oneof(fc.string({ minLength: 1, maxLength: 30 }), fc.integer({ min: 0, max: 9999 })),
  { minKeys: 3, maxKeys: 15 },
);

describe('Detail page field display — P6', () => {
  it('dialogue detail: all top-level record keys appear in <pre> block (100 iterations)', async () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'dlg-test' });
    await fc.assert(
      fc.asyncProperty(flatRecordArb, async (record) => {
        global.fetch = mockDetailResponse(record);
        const { unmount } = render(<DialogueDetailPage />);
        await waitFor(() => { expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); });
        const pre = document.querySelector('pre');
        expect(pre).not.toBeNull();
        const preText = pre!.textContent ?? '';
        for (const key of Object.keys(record)) { expect(preText).toContain(key); }
        unmount();
      }),
      { numRuns: 100, timeout: 30000 },
    );
  });

  it('scene detail: all top-level record keys appear in <pre> block (100 iterations)', async () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'scene-test' });
    await fc.assert(
      fc.asyncProperty(flatRecordArb, async (record) => {
        global.fetch = mockDetailResponse(record);
        const { unmount } = render(<SceneDetailPage />);
        await waitFor(() => { expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); });
        const pre = document.querySelector('pre');
        expect(pre).not.toBeNull();
        const preText = pre!.textContent ?? '';
        for (const key of Object.keys(record)) { expect(preText).toContain(key); }
        unmount();
      }),
      { numRuns: 100, timeout: 30000 },
    );
  });

  it('character detail: all top-level record keys appear in <pre> block (100 iterations)', async () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'char-test' });
    await fc.assert(
      fc.asyncProperty(flatRecordArb, async (record) => {
        global.fetch = mockDetailResponse(record);
        const { unmount } = render(<CharacterDetailPage />);
        await waitFor(() => { expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); });
        const pre = document.querySelector('pre');
        expect(pre).not.toBeNull();
        const preText = pre!.textContent ?? '';
        for (const key of Object.keys(record)) { expect(preText).toContain(key); }
        unmount();
      }),
      { numRuns: 100, timeout: 30000 },
    );
  });
});
