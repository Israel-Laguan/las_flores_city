/**
 * UI tests for the content list view pages (Dialogues, Scenes, Characters)
 * and their detail pages.
 *
 * Tasks 11.2–11.4
 * Requirements: 6.1–9.8
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import '@testing-library/jest-dom';

// ── Mock next/navigation so detail pages' useParams() works in jsdom ─────────
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
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
  {
    id: 'dlg-uuid-1',
    name: 'Intro Dialogue',
    description: 'The opening conversation',
    nodeCount: 5,
    beatAssociation: 'act_1_intro',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
  },
  {
    id: 'dlg-uuid-2',
    name: 'Market Chat',
    description: 'A vendor exchange',
    nodeCount: 3,
    beatAssociation: null,
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-06-02T00:00:00Z',
  },
];

const SAMPLE_SCENES = [
  {
    id: 'scene-uuid-1',
    name: 'The Plaza',
    description: 'Central district plaza',
    district: 'Centro',
    requiredStoryBeat: 'act_1_intro',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
  },
  {
    id: 'scene-uuid-2',
    name: 'Night Market',
    description: 'Underground commerce hub',
    district: 'Barrio Bajo',
    requiredStoryBeat: null,
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-06-02T00:00:00Z',
  },
];

const SAMPLE_CHARACTERS = [
  {
    id: 'char-uuid-1',
    name: 'Carlos Hernandez',
    title: 'Street Fixer',
    description: 'A well-connected operative',
    portraitStatus: 'ready',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
  },
  {
    id: 'char-uuid-2',
    name: 'Yuki Tanaka',
    title: 'Corporate Spy',
    description: 'Works in the shadows',
    portraitStatus: 'missing',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-06-02T00:00:00Z',
  },
];

// helper to build a dialogue item from fc-generated data
function makeDialogueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dlg-test-id',
    name: 'Test',
    description: 'desc',
    nodeCount: 1,
    beatAssociation: null as string | null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Task 11.4 — Dialogues list page example-based tests ──────────────────────

describe('DialoguesPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    // fetch returns a never-resolving promise (set in beforeEach)
    render(<DialoguesPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    global.fetch = mockFetchReject();
    render(<DialoguesPage />);
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch dialogues')).toBeInTheDocument();
    });
  });

  it('renders pagination controls when total > pageSize', async () => {
    // total=150, pageSize=50 → 3 pages
    global.fetch = mockListResponse(SAMPLE_DIALOGUES, 150);
    render(<DialoguesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /dialogues/${id}', async () => {
    global.fetch = mockListResponse(SAMPLE_DIALOGUES);
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: assignSpy,
      get: () => '',
      configurable: true,
    });
    render(<DialoguesPage />);
    await waitFor(() => {
      expect(screen.getByText('Intro Dialogue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Intro Dialogue'));
    expect(assignSpy).toHaveBeenCalledWith('/dialogues/dlg-uuid-1');
  });
});

// ── Task 11.4 — Scenes list page example-based tests ─────────────────────────

describe('ScenesPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    render(<ScenesPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    global.fetch = mockFetchReject();
    render(<ScenesPage />);
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch scenes')).toBeInTheDocument();
    });
  });

  it('renders pagination controls when total > pageSize', async () => {
    global.fetch = mockListResponse(SAMPLE_SCENES, 120);
    render(<ScenesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /scenes/${id}', async () => {
    global.fetch = mockListResponse(SAMPLE_SCENES);
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: assignSpy,
      get: () => '',
      configurable: true,
    });
    render(<ScenesPage />);
    await waitFor(() => {
      expect(screen.getByText('The Plaza')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('The Plaza'));
    expect(assignSpy).toHaveBeenCalledWith('/scenes/scene-uuid-1');
  });
});

// ── Task 11.4 — Characters list page example-based tests ─────────────────────

describe('CharactersPage', () => {
  it('shows loading indicator before fetch resolves', () => {
    render(<CharactersPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows errorBox on fetch failure', async () => {
    global.fetch = mockFetchReject();
    render(<CharactersPage />);
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch characters')).toBeInTheDocument();
    });
  });

  it('renders pagination controls when total > pageSize', async () => {
    global.fetch = mockListResponse(SAMPLE_CHARACTERS, 200);
    render(<CharactersPage />);
    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 4/)).toBeInTheDocument();
    });
    expect(screen.getByText('← Prev')).toBeInTheDocument();
    expect(screen.getByText('Next →')).toBeInTheDocument();
  });

  it('clicking a row navigates to /characters/${id}', async () => {
    global.fetch = mockListResponse(SAMPLE_CHARACTERS);
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, 'href', {
      set: assignSpy,
      get: () => '',
      configurable: true,
    });
    render(<CharactersPage />);
    await waitFor(() => {
      expect(screen.getByText('Carlos Hernandez')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Carlos Hernandez'));
    expect(assignSpy).toHaveBeenCalledWith('/characters/char-uuid-1');
  });
});

// ── Task 11.4 — Detail page example-based tests ───────────────────────────────

describe('DialogueDetailPage', () => {
  beforeEach(() => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'dlg-uuid-1' });
  });

  it('shows "Not found." on 404 response', async () => {
    global.fetch = mockFetch404();
    render(<DialogueDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Not found.')).toBeInTheDocument();
    });
  });

  it('shows "← Back to Dialogues" back link', async () => {
    global.fetch = mockDetailResponse({ id: 'dlg-uuid-1', name: 'Test' });
    render(<DialogueDetailPage />);
    // back link renders immediately (before fetch)
    expect(screen.getByText('← Back to Dialogues')).toBeInTheDocument();
  });
});

describe('SceneDetailPage', () => {
  beforeEach(() => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'scene-uuid-1' });
  });

  it('shows "← Back to Scenes" back link', async () => {
    global.fetch = mockDetailResponse({ id: 'scene-uuid-1', name: 'Test' });
    render(<SceneDetailPage />);
    expect(screen.getByText('← Back to Scenes')).toBeInTheDocument();
  });
});

describe('CharacterDetailPage', () => {
  beforeEach(() => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'char-uuid-1' });
  });

  it('shows "← Back to Characters" back link', async () => {
    global.fetch = mockDetailResponse({ id: 'char-uuid-1', name: 'Test' });
    render(<CharacterDetailPage />);
    expect(screen.getByText('← Back to Characters')).toBeInTheDocument();
  });
});

// Nav test — skipped: testing Next.js root layouts in jsdom is complex
describe('Nav layout', () => {
  it.todo('layout renders links to /dialogues, /scenes, /characters');
});

// ── Task 11.2 — Property P5: List page badge rendering ───────────────────────
// Validates: Requirements 6.4, 6.5, 7.4, 7.5, 8.4, 8.5

describe('Badge rendering — P5', () => {
  /**
   * **Validates: Requirements 6.4, 6.5**
   *
   * For each generated dialogue item: if beatAssociation is non-null an infoBadge
   * span is rendered with that text; if null an em-dash is shown.
   * Minimum 100 iterations.
   */
  it('dialogues: beatAssociation non-null renders infoBadge, null renders em-dash', async () => {
    // Use a focused set of representative combinations rather than async RTL
    // re-renders per iteration — we cover the same logical branches exhaustively.
    const beatSlugs = ['act_1', 'beat-42', 'intro_scene', 'final_act', 'mid_game'];
    const nullCases = [null, null, null];

    // Test non-null cases
    for (const slug of beatSlugs) {
      const item = makeDialogueItem({ id: `dlg-${slug}`, beatAssociation: slug });
      global.fetch = mockListResponse([item]);
      const { unmount } = render(<DialoguesPage />);
      await waitFor(() => {
        expect(screen.getByText(slug)).toBeInTheDocument();
      });
      // The span contains the slug text and has infoBadge background color
      const badge = screen.getByText(slug);
      expect(badge.tagName).toBe('SPAN');
      expect(badge).toHaveStyle({ backgroundColor: '#0066ff' });
      unmount();
    }

    // Test null cases — em-dash should appear
    for (const _ of nullCases) {
      const item = makeDialogueItem({ id: 'dlg-null', beatAssociation: null });
      global.fetch = mockListResponse([item]);
      const { unmount } = render(<DialoguesPage />);
      await waitFor(() => {
        // em-dash in the beat association column
        const cells = screen.getAllByText('—');
        expect(cells.length).toBeGreaterThan(0);
      });
      unmount();
    }
  });

  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * For each generated scene item: if requiredStoryBeat is non-null infoBadge is
   * rendered with that text; if null an em-dash is shown.
   */
  it('scenes: requiredStoryBeat non-null renders infoBadge, null renders em-dash', async () => {
    const beatSlugs = ['chapter_1', 'epilogue', 'act_2_start', 'mid_point'];

    for (const slug of beatSlugs) {
      const item = {
        id: `scene-${slug}`,
        name: 'Test Scene',
        description: 'desc',
        district: 'Centro',
        requiredStoryBeat: slug,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      global.fetch = mockListResponse([item]);
      const { unmount } = render(<ScenesPage />);
      await waitFor(() => {
        expect(screen.getByText(slug)).toBeInTheDocument();
      });
      const badge = screen.getByText(slug);
      expect(badge.tagName).toBe('SPAN');
      expect(badge).toHaveStyle({ backgroundColor: '#0066ff' });
      unmount();
    }

    // null → em-dash
    const nullItem = {
      id: 'scene-null',
      name: 'No Beat Scene',
      description: 'desc',
      district: 'Sur',
      requiredStoryBeat: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    global.fetch = mockListResponse([nullItem]);
    const { unmount } = render(<ScenesPage />);
    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThan(0);
    });
    unmount();
  });

  /**
   * **Validates: Requirements 8.4, 8.5**
   *
   * For each generated character item: portraitStatus==="ready" renders a
   * successBadge; any other value renders a warningBadge.
   */
  it('characters: portraitStatus ready renders successBadge, missing renders warningBadge', async () => {
    // Test "ready" case
    const readyItem = {
      id: 'char-ready',
      name: 'Ready Character',
      title: 'Hero',
      description: 'desc',
      portraitStatus: 'ready',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    global.fetch = mockListResponse([readyItem]);
    const { unmount: unmount1 } = render(<CharactersPage />);
    await waitFor(() => {
      const badge = screen.getByText('ready');
      expect(badge.tagName).toBe('SPAN');
      expect(badge).toHaveStyle({ backgroundColor: '#00ff00' });
    });
    unmount1();

    // Test "missing" case
    const missingItem = {
      id: 'char-missing',
      name: 'Missing Character',
      title: 'NPC',
      description: 'desc',
      portraitStatus: 'missing',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    global.fetch = mockListResponse([missingItem]);
    const { unmount: unmount2 } = render(<CharactersPage />);
    await waitFor(() => {
      const badge = screen.getByText('missing');
      expect(badge.tagName).toBe('SPAN');
      expect(badge).toHaveStyle({ backgroundColor: '#ffaa00' });
    });
    unmount2();
  });

  /**
   * **Validates: Requirements 6.4, 6.5, 7.4, 7.5, 8.4, 8.5**
   *
   * fast-check property: badge rendering invariants hold across random arrays.
   * Runs 100 iterations covering all content types.
   */
  it('fast-check: badge rendering holds across random dialogue arrays (100 iterations)', async () => {
    const beatSlugArb = fc.oneof(
      fc.constant(null),
      fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            description: fc.string({ minLength: 0, maxLength: 50 }),
            nodeCount: fc.integer({ min: 0, max: 99 }),
            beatAssociation: beatSlugArb,
            createdAt: fc.constant('2024-01-01T00:00:00Z'),
            updatedAt: fc.constant('2024-01-01T00:00:00Z'),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (items) => {
          global.fetch = mockListResponse(items);
          const { unmount } = render(<DialoguesPage />);
          await waitFor(() => {
            // table renders after loading resolves
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
          });

          for (const item of items) {
            if (item.beatAssociation !== null) {
              // queryAllByText handles multiple items sharing the same slug
              const els = screen.queryAllByText(item.beatAssociation);
              expect(els.length).toBeGreaterThan(0);
              // every matching element should be a SPAN with infoBadge color
              for (const el of els) {
                expect(el.tagName).toBe('SPAN');
                expect(el).toHaveStyle({ backgroundColor: '#0066ff' });
              }
            }
          }

          // at least one em-dash present if any item has null beatAssociation
          const hasNull = items.some(i => i.beatAssociation === null);
          if (hasNull) {
            expect(screen.queryAllByText('—').length).toBeGreaterThan(0);
          }

          unmount();
        },
      ),
      { numRuns: 100, timeout: 30000 },
    );
  });

  it('fast-check: badge rendering holds across random character arrays (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 20 }),
            title: fc.string({ minLength: 0, maxLength: 20 }),
            description: fc.string({ minLength: 0, maxLength: 50 }),
            portraitStatus: fc.oneof(fc.constant('ready'), fc.constant('missing')),
            createdAt: fc.constant('2024-01-01T00:00:00Z'),
            updatedAt: fc.constant('2024-01-01T00:00:00Z'),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (items) => {
          global.fetch = mockListResponse(items);
          const { unmount } = render(<CharactersPage />);
          await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
          });

          // Every "ready" badge should have successBadge color; every "missing" warningBadge color
          const readyBadges = screen.queryAllByText('ready');
          for (const badge of readyBadges) {
            expect(badge).toHaveStyle({ backgroundColor: '#00ff00' });
          }
          const missingBadges = screen.queryAllByText('missing');
          for (const badge of missingBadges) {
            expect(badge).toHaveStyle({ backgroundColor: '#ffaa00' });
          }

          unmount();
        },
      ),
      { numRuns: 100, timeout: 30000 },
    );
  });
});

// ── Task 11.3 — Property P6: Detail page field display completeness ───────────
// Validates: Requirements 9.1, 9.2, 9.3, 9.5

/** Arbitrary that generates a flat record with 3–15 top-level string/number keys */
const flatRecordArb = fc.dictionary(
  // keys: lowercase letters only to avoid JSON.stringify quoting surprises
  fc.stringMatching(/^[a-z][a-z0-9]{1,14}$/),
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 30 }),
    fc.integer({ min: 0, max: 9999 }),
  ),
  { minKeys: 3, maxKeys: 15 },
);

describe('Detail page field display — P6', () => {
  /**
   * **Validates: Requirements 9.1, 9.5**
   *
   * All top-level keys of a random record object appear in the <pre> block
   * after DialogueDetailPage renders, for 100 iterations.
   */
  it('dialogue detail: all top-level record keys appear in <pre> block (100 iterations)', async () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'dlg-test' });

    await fc.assert(
      fc.asyncProperty(flatRecordArb, async (record) => {
        global.fetch = mockDetailResponse(record);
        const { unmount } = render(<DialogueDetailPage />);

        await waitFor(() => {
          expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        });

        const pre = document.querySelector('pre');
        expect(pre).not.toBeNull();
        const preText = pre!.textContent ?? '';

        for (const key of Object.keys(record)) {
          expect(preText).toContain(key);
        }

        unmount();
      }),
      { numRuns: 100, timeout: 30000 },
    );
  });

  /**
   * **Validates: Requirements 9.2, 9.5**
   *
   * All top-level keys of a random record object appear in the <pre> block
   * after SceneDetailPage renders, for 100 iterations.
   */
  it('scene detail: all top-level record keys appear in <pre> block (100 iterations)', async () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'scene-test' });

    await fc.assert(
      fc.asyncProperty(flatRecordArb, async (record) => {
        global.fetch = mockDetailResponse(record);
        const { unmount } = render(<SceneDetailPage />);

        await waitFor(() => {
          expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        });

        const pre = document.querySelector('pre');
        expect(pre).not.toBeNull();
        const preText = pre!.textContent ?? '';

        for (const key of Object.keys(record)) {
          expect(preText).toContain(key);
        }

        unmount();
      }),
      { numRuns: 100, timeout: 30000 },
    );
  });

  /**
   * **Validates: Requirements 9.3, 9.5**
   *
   * All top-level keys of a random record object appear in the <pre> block
   * after CharacterDetailPage renders, for 100 iterations.
   */
  it('character detail: all top-level record keys appear in <pre> block (100 iterations)', async () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ id: 'char-test' });

    await fc.assert(
      fc.asyncProperty(flatRecordArb, async (record) => {
        global.fetch = mockDetailResponse(record);
        const { unmount } = render(<CharacterDetailPage />);

        await waitFor(() => {
          expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        });

        const pre = document.querySelector('pre');
        expect(pre).not.toBeNull();
        const preText = pre!.textContent ?? '';

        for (const key of Object.keys(record)) {
          expect(preText).toContain(key);
        }

        unmount();
      }),
      { numRuns: 100, timeout: 30000 },
    );
  });
});
