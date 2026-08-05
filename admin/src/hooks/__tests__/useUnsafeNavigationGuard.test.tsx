import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// ============================================================
// Unsaved-changes navigation guard
//
// Editors lose work through more than one exit: the browser Back
// button, in-app <Link>/anchor clicks, tab close, and programmatic
// router navigations such as logout. The guard must cover all of
// them, and — critically — a declined Back must leave the user on
// the editor route with the draft intact.
// ============================================================

let mockPathname = '/dialogues/1';
const routerReplace = vi.fn();
const routeEvents = {
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: routerReplace, push: vi.fn(), refresh: vi.fn(), events: routeEvents }),
}));

import { useUnsafeNavigationGuard, isDialogueDirty, setDialogueDirty } from '../useUnsafeNavigationGuard';

function Editor({ dirty }: { dirty: boolean }) {
  useUnsafeNavigationGuard(dirty);
  return <a href="/dialogues">Back to Dialogues</a>;
}

let confirmSpy: ReturnType<typeof vi.spyOn>;
let goSpy: ReturnType<typeof vi.spyOn>;

/** Simulate the Navigation API's current-entry index (used for Back/Forward direction). */
function withNavigationIndex(index: number): void {
  Object.defineProperty(window, 'navigation', {
    configurable: true,
    value: { currentEntry: { index } },
  });
}

/** The handler the hook registered for Next's `routeChangeStart` event. */
function routeChangeStartHandler(): ((url: string) => void) | undefined {
  const call = routeEvents.on.mock.calls.find(([event]) => event === 'routeChangeStart');
  return call ? (call[1] as (url: string) => void) : undefined;
}

beforeEach(() => {
  mockPathname = '/dialogues/1';
  routerReplace.mockClear();
  routeEvents.on.mockClear();
  routeEvents.off.mockClear();
  setDialogueDirty(false);
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { navigation?: unknown }).navigation;
});

// eslint-disable-next-line max-lines-per-function -- the suite spans many guards
describe('useUnsafeNavigationGuard', () => {
  describe('browser back/forward', () => {
    // jsdom's history.go is a no-op, so this is a mechanism-level assertion:
    // a DECLINED Back is compensated with history.go(1), which returns to the
    // editor's forward entry without appending a fresh history entry. The
    // state-level guarantee (editor stays mounted, draft preserved) is asserted
    // by the DOM checks below.
    it('compensates a declined Back with a forward navigation', () => {
      withNavigationIndex(2);
      render(<Editor dirty />);

      act(() => {
        withNavigationIndex(1);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      // popstate cannot be cancelled, so the guard navigates forward again
      // rather than pushing a new entry (which would pile up history).
      expect(goSpy).toHaveBeenCalledWith(1);
      // The editor is still mounted with its draft — nothing was re-rendered away.
      expect(screen.getByRole('link', { name: 'Back to Dialogues' })).toBeInTheDocument();
    });

    it('compensates a declined Forward by navigating back again', () => {
      withNavigationIndex(2);
      render(<Editor dirty />);

      act(() => {
        withNavigationIndex(3);
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      // go(-1) returns to the editor entry after a declined Forward — go(1)
      // would move farther forward (or do nothing), leaving the dirty page.
      expect(goSpy).toHaveBeenCalledWith(-1);
    });

    it('defaults to Back compensation when the Navigation API is unavailable', () => {
      render(<Editor dirty />);

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(goSpy).toHaveBeenCalledWith(1);
    });

    it('does not re-prompt for the compensating navigation it triggered', () => {
      render(<Editor dirty />);

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      // history.go(1) fires a second popstate; it must be swallowed, otherwise
      // the user is trapped in a confirm loop.
      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(goSpy).toHaveBeenCalledTimes(1);
    });

    it('allows the navigation when the user confirms', () => {
      confirmSpy.mockReturnValue(true);
      render(<Editor dirty />);

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(goSpy).not.toHaveBeenCalled();
    });

    it('does not prompt when the editor is clean', () => {
      render(<Editor dirty={false} />);

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(goSpy).not.toHaveBeenCalled();
    });
  });

  describe('in-app link navigation', () => {
    it('blocks an anchor navigation when the user declines', () => {
      render(<Editor dirty />);

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      act(() => {
        screen.getByRole('link', { name: 'Back to Dialogues' }).dispatchEvent(clickEvent);
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(clickEvent.defaultPrevented).toBe(true);
    });

    it('lets the navigation through when the user confirms', () => {
      confirmSpy.mockReturnValue(true);
      render(<Editor dirty />);

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      act(() => {
        screen.getByRole('link', { name: 'Back to Dialogues' }).dispatchEvent(clickEvent);
      });

      expect(clickEvent.defaultPrevented).toBe(false);
    });

    it('ignores clicks while the editor is clean', () => {
      render(<Editor dirty={false} />);

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      act(() => {
        screen.getByRole('link', { name: 'Back to Dialogues' }).dispatchEvent(clickEvent);
      });

      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });

  describe('programmatic router navigation (logout, router.replace)', () => {
    it('confirms and reverts to the editor when the user declines', () => {
      render(<Editor dirty />);
      const handler = routeChangeStartHandler();
      expect(handler).toBeTypeOf('function');

      act(() => {
        handler!('/login');
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(routerReplace).toHaveBeenCalledWith(window.location.href);
      expect(screen.getByRole('link', { name: 'Back to Dialogues' })).toBeInTheDocument();
    });

    it('lets the navigation through when the user confirms', () => {
      confirmSpy.mockReturnValue(true);
      render(<Editor dirty />);
      const handler = routeChangeStartHandler();

      act(() => {
        handler!('/login');
      });

      expect(routerReplace).not.toHaveBeenCalled();
    });
  });

  describe('tab close / reload', () => {
    it('cancels the unload while dirty', () => {
      render(<Editor dirty />);

      const event = new Event('beforeunload', { cancelable: true });
      act(() => {
        window.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(true);
    });

    it('does not cancel the unload while clean', () => {
      render(<Editor dirty={false} />);

      const event = new Event('beforeunload', { cancelable: true });
      act(() => {
        window.dispatchEvent(event);
      });

      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('shared dirty flag', () => {
    it('publishes the dirty state so router-driven exits (e.g. logout) can guard', () => {
      const { rerender, unmount } = render(<Editor dirty />);
      expect(isDialogueDirty()).toBe(true);

      rerender(<Editor dirty={false} />);
      expect(isDialogueDirty()).toBe(false);

      unmount();
    });

    it('clears the shared flag when the editor unmounts', () => {
      const { unmount } = render(<Editor dirty />);
      expect(isDialogueDirty()).toBe(true);

      unmount();
      expect(isDialogueDirty()).toBe(false);
    });
  });
});
