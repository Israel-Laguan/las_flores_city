import { render, screen, act, fireEvent } from '@testing-library/react';
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
const routerPush = vi.fn();
const routeEvents = {
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: routerReplace, push: routerPush, refresh: vi.fn(), events: routeEvents }),
}));

import { useUnsafeNavigationGuard, useGuardedNavigation, isDialogueDirty, setDialogueDirty } from '../useUnsafeNavigationGuard';

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

beforeEach(() => {
  mockPathname = '/dialogues/1';
  routerReplace.mockClear();
  routerPush.mockClear();
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

    it('does not compensate when no prior direction is known', () => {
      render(<Editor dirty />);

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      // Without the Navigation API there is no reliable Back-vs-Forward signal,
      // so compensating could push the user FURTHER from the editor and unmount
      // it, losing the draft. The guard prompts but leaves the URL alone
      // instead of guessing a direction.
      expect(goSpy).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: 'Back to Dialogues' })).toBeInTheDocument();
    });

    it('does not re-prompt for the compensating navigation it triggered', () => {
      withNavigationIndex(2);
      render(<Editor dirty />);

      act(() => {
        // Declined Back — the guard compensates with history.go(1).
        withNavigationIndex(1);
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

    it('skips confirmation for ctrl/meta/shift/alt clicks', () => {
      render(<Editor dirty />);

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
      act(() => {
        screen.getByRole('link', { name: 'Back to Dialogues' }).dispatchEvent(clickEvent);
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(clickEvent.defaultPrevented).toBe(false);
    });

    it('skips confirmation for non-primary mouse buttons', () => {
      render(<Editor dirty />);

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 });
      act(() => {
        screen.getByRole('link', { name: 'Back to Dialogues' }).dispatchEvent(clickEvent);
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(clickEvent.defaultPrevented).toBe(false);
    });

    it('skips confirmation for download links', () => {
      render(
        <>
          <Editor dirty />
          <a href="/download" download>
            Download
          </a>
        </>,
      );

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      act(() => {
        screen.getByRole('link', { name: 'Download' }).dispatchEvent(clickEvent);
      });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(clickEvent.defaultPrevented).toBe(false);
    });
  });

  describe('useGuardedNavigation (imperative router navigations)', () => {
    // The App Router exposes no router.events/routeChangeStart, so imperative
    // programmatic navigations must flow through useGuardedNavigation, which
    // checks the shared dirty flag before invoking the real router.
    function GuardedFixture() {
      const { push, replace } = useGuardedNavigation();
      return (
        <>
          <button type="button" onClick={() => push('/dialogues/3')}>Push</button>
          <button type="button" onClick={() => replace('/dialogues/4')}>Replace</button>
        </>
      );
    }

    it('does not rely on router.events (unavailable in the App Router)', () => {
      render(<Editor dirty />);

      expect(routeEvents.on).not.toHaveBeenCalled();
      expect(routeEvents.off).not.toHaveBeenCalled();
    });

    it('navigates immediately while the shared flag is clean', () => {
      setDialogueDirty(false);
      render(<GuardedFixture />);

      fireEvent.click(screen.getByRole('button', { name: 'Push' }));

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(routerPush).toHaveBeenCalledWith('/dialogues/3');
    });

    it('blocks the navigation when dirty and the user declines', () => {
      setDialogueDirty(true);
      render(<GuardedFixture />);

      fireEvent.click(screen.getByRole('button', { name: 'Push' }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(routerPush).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Push' })).toBeInTheDocument();
    });

    it('proceeds when dirty and the user confirms', () => {
      confirmSpy.mockReturnValue(true);
      setDialogueDirty(true);
      render(<GuardedFixture />);

      fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

      expect(routerReplace).toHaveBeenCalledWith('/dialogues/4');
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
