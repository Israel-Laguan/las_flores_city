/**
 * UI tests for badge rendering across list pages.
 * Task 11.2 — Property P5
 * Requirements: 6.4, 6.5, 7.4, 7.5, 8.4, 8.5
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import '@testing-library/jest-dom';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: () => ({ push: mockPush }),
}));

import DialoguesPage from '../dialogues/page';
import ScenesPage from '../scenes/page';
import CharactersPage from '../characters/page';

beforeEach(() => {
  vi.restoreAllMocks();
  mockPush.mockClear();
  global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
});

function mockListResponse(items: unknown[], total?: number) {
  const t = total ?? items.length;
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    json: () => Promise.resolve({ success: true, data: { items, total: t, page: 1, pageSize: 50 } }),
  });
}

function makeDialogueItem(overrides: Record<string, unknown> = {}) {
  return { id: 'dlg-test-id', name: 'Test', description: 'desc', nodeCount: 1, beatAssociation: null as string | null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', ...overrides };
}

describe('Dialogue badge rendering', () => {
  it('beatAssociation non-null renders infoBadge, null renders em-dash', async () => {
    for (const slug of ['act_1', 'beat-42', 'intro_scene', 'final_act', 'mid_game']) {
      const item = makeDialogueItem({ id: `dlg-${slug}`, beatAssociation: slug });
      global.fetch = mockListResponse([item]);
      const { unmount } = render(<DialoguesPage />);
      await waitFor(() => { expect(screen.getByText(slug)).toBeInTheDocument(); });
      const badge = screen.getByText(slug);
      expect(badge.tagName).toBe('SPAN');
      expect(badge).toHaveStyle({ backgroundColor: '#0066ff' });
      unmount();
    }
    for (let i = 0; i < 3; i++) {
      global.fetch = mockListResponse([makeDialogueItem({ id: 'dlg-null', beatAssociation: null })]);
      const { unmount } = render(<DialoguesPage />);
      await waitFor(() => { expect(screen.getAllByText('—').length).toBeGreaterThan(0); });
      unmount();
    }
  });
});

describe('Scene badge rendering', () => {
  it('requiredStoryBeat non-null renders infoBadge, null renders em-dash', async () => {
    for (const slug of ['chapter_1', 'epilogue', 'act_2_start', 'mid_point']) {
      const item = { id: `scene-${slug}`, name: 'Test Scene', description: 'desc', district: 'Centro', requiredStoryBeat: slug, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' };
      global.fetch = mockListResponse([item]);
      const { unmount } = render(<ScenesPage />);
      await waitFor(() => { expect(screen.getByText(slug)).toBeInTheDocument(); });
      const badge = screen.getByText(slug);
      expect(badge.tagName).toBe('SPAN');
      expect(badge).toHaveStyle({ backgroundColor: '#0066ff' });
      unmount();
    }
    const nullItem = { id: 'scene-null', name: 'No Beat Scene', description: 'desc', district: 'Sur', requiredStoryBeat: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' };
    global.fetch = mockListResponse([nullItem]);
    const { unmount } = render(<ScenesPage />);
    await waitFor(() => { expect(screen.getAllByText('—').length).toBeGreaterThan(0); });
    unmount();
  });
});

describe('Character badge rendering', () => {
  it('portraitStatus ready renders successBadge, missing renders warningBadge', async () => {
    global.fetch = mockListResponse([{ id: 'char-ready', name: 'Ready Character', title: 'Hero', description: 'desc', portraitStatus: 'ready', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }]);
    const { unmount: u1 } = render(<CharactersPage />);
    await waitFor(() => { const b = screen.getByText('ready'); expect(b.tagName).toBe('SPAN'); expect(b).toHaveStyle({ backgroundColor: '#00ff00' }); });
    u1();

    global.fetch = mockListResponse([{ id: 'char-missing', name: 'Missing Character', title: 'NPC', description: 'desc', portraitStatus: 'missing', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }]);
    const { unmount: u2 } = render(<CharactersPage />);
    await waitFor(() => { const b = screen.getByText('missing'); expect(b.tagName).toBe('SPAN'); expect(b).toHaveStyle({ backgroundColor: '#ffaa00' }); });
    u2();
  });
});

describe('Fast-check badge invariants', () => {
  it('dialogue badge rendering holds across random arrays (100 iterations)', async () => {
    const beatSlugArb = fc.oneof(fc.constant(null), fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/));
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1, maxLength: 20 }), description: fc.string({ minLength: 0, maxLength: 50 }), nodeCount: fc.integer({ min: 0, max: 99 }), beatAssociation: beatSlugArb, createdAt: fc.constant('2024-01-01T00:00:00Z'), updatedAt: fc.constant('2024-01-01T00:00:00Z') }), { minLength: 1, maxLength: 8 }),
        async (items) => {
          global.fetch = mockListResponse(items);
          const { unmount } = render(<DialoguesPage />);
          await waitFor(() => { expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); });
          for (const item of items) {
            if (item.beatAssociation !== null) {
              const els = screen.queryAllByText(item.beatAssociation);
              expect(els.length).toBeGreaterThan(0);
              for (const el of els) { expect(el.tagName).toBe('SPAN'); expect(el).toHaveStyle({ backgroundColor: '#0066ff' }); }
            }
          }
          if (items.some(i => i.beatAssociation === null)) { expect(screen.queryAllByText('—').length).toBeGreaterThan(0); }
          unmount();
        },
      ),
      { numRuns: 100, timeout: 30000 },
    );
  });

  it('character badge rendering holds across random arrays (100 iterations)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1, maxLength: 20 }), title: fc.string({ minLength: 0, maxLength: 20 }), description: fc.string({ minLength: 0, maxLength: 50 }), portraitStatus: fc.oneof(fc.constant('ready'), fc.constant('missing')), createdAt: fc.constant('2024-01-01T00:00:00Z'), updatedAt: fc.constant('2024-01-01T00:00:00Z') }), { minLength: 1, maxLength: 8 }),
        async (items) => {
          global.fetch = mockListResponse(items);
          const { unmount } = render(<CharactersPage />);
          await waitFor(() => { expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); });
          for (const badge of screen.queryAllByText('ready')) { expect(badge).toHaveStyle({ backgroundColor: '#00ff00' }); }
          for (const badge of screen.queryAllByText('missing')) { expect(badge).toHaveStyle({ backgroundColor: '#ffaa00' }); }
          unmount();
        },
      ),
      { numRuns: 100, timeout: 30000 },
    );
  });
});
