/**
 * UI tests for badge rendering across list pages.
 * Ported from dashboard for admin parity.
 * Admin uses CSS modules for badges, so we check class names instead of inline styles.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

import { adminFetch } from '@/lib/client-api';
import DialoguesPage from '../dialogues/page';
import ScenesPage from '../scenes/page';
import CharactersPage from '../characters/page';

beforeEach(() => {
  vi.restoreAllMocks();
  mockPush.mockClear();
  (adminFetch as ReturnType<typeof vi.fn>).mockReset();
});

function mockListResponse(items: unknown[], total?: number) {
  const t = total ?? items.length;
  return (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    data: { items, total: t, page: 1, pageSize: 50 },
  });
}

function makeDialogueItem(overrides: Record<string, unknown> = {}) {
  return { id: 'dlg-test-id', name: 'Test', description: 'desc', nodeCount: 1, beatAssociation: null as string | null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', ...overrides };
}

function hasInfoBadge(el: Element): boolean {
  return el.className.includes('info');
}

function hasSuccessBadge(el: Element): boolean {
  return el.className.includes('success');
}

function hasWarningBadge(el: Element): boolean {
  return el.className.includes('warning');
}

describe('Dialogue badge rendering', () => {
  it('beatAssociation non-null renders infoBadge, null renders em-dash', async () => {
    for (const slug of ['act_1', 'beat-42', 'intro_scene', 'final_act', 'mid_game']) {
      const item = makeDialogueItem({ id: `dlg-${slug}`, beatAssociation: slug });
      mockListResponse([item]);
      const { unmount } = render(<DialoguesPage />);
      await waitFor(() => { expect(screen.getByText(slug)).toBeInTheDocument(); });
      const badge = screen.getByText(slug);
      expect(badge.tagName).toBe('SPAN');
      expect(hasInfoBadge(badge)).toBe(true);
      unmount();
    }
    for (let i = 0; i < 3; i++) {
      mockListResponse([makeDialogueItem({ id: 'dlg-null', beatAssociation: null })]);
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
      mockListResponse([item]);
      const { unmount } = render(<ScenesPage />);
      await waitFor(() => { expect(screen.getByText(slug)).toBeInTheDocument(); });
      const badge = screen.getByText(slug);
      expect(badge.tagName).toBe('SPAN');
      expect(hasInfoBadge(badge)).toBe(true);
      unmount();
    }
    const nullItem = { id: 'scene-null', name: 'No Beat Scene', description: 'desc', district: 'Sur', requiredStoryBeat: null, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' };
    mockListResponse([nullItem]);
    const { unmount } = render(<ScenesPage />);
    await waitFor(() => { expect(screen.getAllByText('—').length).toBeGreaterThan(0); });
    unmount();
  });
});

describe('Character badge rendering', () => {
  it('portraitStatus ready renders successBadge, missing renders warningBadge', async () => {
    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { items: [{ id: 'char-ready', name: 'Ready Character', title: 'Hero', description: 'desc', portraitStatus: 'ready', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }], total: 1, page: 1, pageSize: 50 },
    });
    const { unmount: u1 } = render(<CharactersPage />);
    await waitFor(() => { const b = screen.getByText('ready'); expect(b.tagName).toBe('SPAN'); expect(hasSuccessBadge(b)).toBe(true); });
    u1();

    (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { items: [{ id: 'char-missing', name: 'Missing Character', title: 'NPC', description: 'desc', portraitStatus: 'missing', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }], total: 1, page: 1, pageSize: 50 },
    });
    const { unmount: u2 } = render(<CharactersPage />);
    await waitFor(() => { const b = screen.getByText('missing'); expect(b.tagName).toBe('SPAN'); expect(hasWarningBadge(b)).toBe(true); });
    u2();
  });
});

describe('Fast-check badge invariants', () => {
  it('dialogue badge rendering holds across random arrays (100 iterations)', async () => {
    const { oneof, constant, stringMatching, array, record, uuid, integer } = await import('fast-check');
    const fc = await import('fast-check');
    const beatSlugArb = oneof(constant(null), stringMatching(/^[a-z][a-z0-9_]{0,19}$/));
    await fc.assert(
      fc.asyncProperty(
        array(record({ id: uuid(), name: stringMatching(/^.{1,20}$/), description: stringMatching(/^.{0,50}$/), nodeCount: integer({ min: 0, max: 99 }), beatAssociation: beatSlugArb, createdAt: constant('2024-01-01T00:00:00Z'), updatedAt: constant('2024-01-01T00:00:00Z') }), { minLength: 1, maxLength: 8 }),
        async (items) => {
          (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: { items, total: items.length, page: 1, pageSize: 50 },
          });
          const { unmount } = render(<DialoguesPage />);
          await waitFor(() => { expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); });
          for (const item of items) {
            if (item.beatAssociation !== null) {
              const els = screen.queryAllByText(item.beatAssociation, { selector: 'span' });
              expect(els.length).toBeGreaterThan(0);
              for (const el of els) { expect(el.tagName).toBe('SPAN'); expect(hasInfoBadge(el)).toBe(true); }
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
    const fc = await import('fast-check');
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ id: fc.uuid(), name: fc.stringMatching(/^.{1,20}$/), title: fc.stringMatching(/^.{0,20}$/), description: fc.stringMatching(/^.{0,50}$/), portraitStatus: fc.oneof(fc.constant('ready'), fc.constant('missing')), createdAt: fc.constant('2024-01-01T00:00:00Z'), updatedAt: fc.constant('2024-01-01T00:00:00Z') }), { minLength: 1, maxLength: 8 }),
        async (items) => {
          (adminFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            data: { items, total: items.length, page: 1, pageSize: 50 },
          });
          const { unmount } = render(<CharactersPage />);
          await waitFor(() => { expect(screen.queryByText('Loading...')).not.toBeInTheDocument(); });
          for (const badge of screen.queryAllByText('ready', { selector: 'span' })) { expect(hasSuccessBadge(badge)).toBe(true); }
          for (const badge of screen.queryAllByText('missing', { selector: 'span' })) { expect(hasWarningBadge(badge)).toBe(true); }
          unmount();
        },
      ),
      { numRuns: 100, timeout: 30000 },
    );
  });
});
