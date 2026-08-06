'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { isEditorDirty } from '@/components/editor/useEditor';

// Module-level dirty flag so other components (e.g. TopBar) can guard
// router-driven navigations like logout without coupling to this hook.
let __dialogueDirty = false;
export function isDialogueDirty(): boolean {
  return __dialogueDirty;
}
export function setDialogueDirty(value: boolean): void {
  __dialogueDirty = value;
}

const GUARD_MESSAGE = 'You have unsaved changes. Leave anyway?';

/**
 * Absolute index of the current history entry when the Navigation API is
 * available (Chromium, Firefox 139+, Safari 26+). It is the only reliable,
 * framework-independent way to tell browser Back from Forward: the `popstate`
 * event itself conveys no direction. Returns -1 when unavailable.
 */
function getHistoryIndex(): number {
  const navigation = (window as Window & { navigation?: { currentEntry?: { index?: number } } }).navigation;
  const index = navigation?.currentEntry?.index;
  return typeof index === 'number' ? index : -1;
}

/**
 * Shared guarded navigation helper for the App Router.
 *
 * `useUnsafeNavigationGuard` intercepts browser Back/Forward (popstate), reload,
 * and `<Link>`/anchor clicks at the document level, but the App Router does not
 * expose the Pages Router's `router.events`/`routeChangeStart` API, so there is
 * no global hook for imperative `router.push`/`router.replace` calls. Every such
 * call should go through this helper instead: it consults the shared dirty flag
 * and asks for confirmation before handing off to the real router with the
 * caller's exact destination.
 *
 * Outside the dialogue editor the shared flag is false, so the helper behaves
 * exactly like the underlying `router.push`/`router.replace`.
 */
export function useGuardedNavigation(): {
  push: (href: string) => void;
  replace: (href: string) => void;
} {
  const router = useRouter();

  const confirmIfDirty = useCallback((): boolean => {
    return !isDialogueDirty() && !isEditorDirty() || window.confirm(GUARD_MESSAGE);
  }, []);

  const push = useCallback(
    (href: string) => {
      if (confirmIfDirty()) router.push(href);
    },
    [router, confirmIfDirty],
  );

  const replace = useCallback(
    (href: string) => {
      if (confirmIfDirty()) router.replace(href);
    },
    [router, confirmIfDirty],
  );

  return { push, replace };
}

/**
 * Guards against losing unsaved edits on ANY client-side navigation away from
 * the current page, not just a single back link:
 *  - native reload / tab close (beforeunload)
 *  - browser back / forward (popstate)
 *  - in-app anchors including Next `<Link>` (capture-phase click handler)
 *  - imperative router navigations (via the `useGuardedNavigation` helper)
 *
 * When the page is dirty, each transition asks for confirmation and is blocked
 * (or reverted, for popstate) unless the user confirms. Pass `dirty` from the
 * caller; it is read via a ref so the event listeners stay registered once.
 */
export function useUnsafeNavigationGuard(dirty: boolean): void {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Last observed history entry index, kept in sync on every route change and
  // popstate so a declined Back/Forward can be compensated in the opposite
  // direction.
  const historyIndexRef = useRef<number>(-1);

  // Direction sentinel for browsers without the Navigation API. When both
  // indices are -1 we record whether the last observed transition moved the
  // index forward or backward so a declined Forward still compensates with
  // history.go(-1).
  const directionRef = useRef<'forward' | 'back'>('forward');

  // Publish the shared dirty flag so other components (e.g. TopBar) can guard
  // router-driven exits such as logout — and clear it when this editor
  // unmounts, otherwise the next admin page would keep prompting for unsaved
  // dialogue changes.
  useEffect(() => {
    setDialogueDirty(dirty);
    return () => setDialogueDirty(false);
  }, [dirty]);

  // Update the observed history index whenever the route changes.
  useEffect(() => {
    historyIndexRef.current = getHistoryIndex();
  }, [pathname, searchParams]);

  useEffect(() => {
    const message = GUARD_MESSAGE;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const isReturningRef = { current: false };

    const onPopState = () => {
      if (isReturningRef.current) {
        isReturningRef.current = false;
        // The compensating go() just landed back on the editor entry — keep
        // the index baseline in sync so the next unsolicited popstate
        // compares against the correct entry.
        historyIndexRef.current = getHistoryIndex();
        return;
      }
      // Keep the observed index in sync even while clean, so a later dirty
      // transition compares against the right baseline.
      const index = getHistoryIndex();
      const prevIndex = historyIndexRef.current;
      historyIndexRef.current = index;

      if (!dirtyRef.current || window.confirm(message)) return;

      // popstate cannot be cancelled and the URL has already moved, so a
      // declined transition is compensated by navigating back in the OPPOSITE
      // direction: +1 after a Back, -1 after a Forward. The compensating go()
      // returns to the editor entry without appending a fresh history entry,
      // so repeated Back presses do not pile up history.
      const hasNavIndex = prevIndex >= 0 && index >= 0;
      const goingForward = hasNavIndex
        ? index > prevIndex
        : directionRef.current === 'forward';
      directionRef.current = goingForward ? 'back' : 'forward';
      isReturningRef.current = true;
      window.history.go(goingForward ? -1 : 1);
    };

    // Intercept internal anchor/<Link> navigations before Next/router handle
    // them. This covers the sidebar, breadcrumbs, back links, etc.
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      // Modified clicks (Ctrl/Meta/Shift/Alt) and non-primary buttons open a
      // new browsing context or trigger OS-level actions; they do not discard
      // the current draft, so skip the confirmation.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank') return;
      if (anchor.hasAttribute('download')) return;
      if (e.defaultPrevented) return;

      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const url = new URL(href, window.location.href);
      const originSame = url.origin === window.location.origin;
      const current = window.location.href.replace(/\/$/, '');
      const targetHref = url.href.replace(/\/$/, '');
      if (!originSame || targetHref === current) return;

      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
    };
  }, []);
}
