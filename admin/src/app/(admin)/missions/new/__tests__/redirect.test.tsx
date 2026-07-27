import { describe, it, expect, vi } from 'vitest';

const redirectMock = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (...args: any[]) => redirectMock(...args),
}));

import MissionNewRedirect from '../page';

describe('missions/new redirect (M13)', () => {
  it('redirects to /story-builder on render', () => {
    try {
      MissionNewRedirect();
    } catch {
      // redirect() throws a special NEXT_REDIRECT error; that's expected
    }
    expect(redirectMock).toHaveBeenCalledWith('/story-builder');
  });
});
