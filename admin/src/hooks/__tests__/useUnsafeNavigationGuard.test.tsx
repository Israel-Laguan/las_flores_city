import { render, screen, fireEvent, act } from '@testing-library/react';
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
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: routerReplace, push: vi.fn(), refresh: vi.fn() }),
}));

import { useUnsafeNavigationGuard, isDialogueDirty, setDialogueDirty } from '../useUnsafeNavigationGuard';

function Editor({ dirty }: { dirty: boolean }) {
  useUnsafeNavigationGuard(dirty);
  return <a href="/dialogues">Back to Dialogues</a>;
}

let confirmSpy: ReturnType<typeof vi.spyOn>;
let goSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockPathname = '/dialogues/1';
  routerReplace.mockClear();
  setDialogueDirty(false);
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUnsafeNavigationGuard', () => {
  describe('browser back/forward', () => {
    it('returns to the editor entry when the user declines', () => {
      render(<Editor dirty />);

      act(() => {
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      // popstate cannot be cancelled, so the guard navigates forward again
      // rather than pushing a new entry (which would pile up history).
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

      fireEvent.click(screen.getByRole('link', { name: 'Back to Dialogues' }));

      expect(confirmSpy).not.toHaveBeenCalled();
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
  });
});
