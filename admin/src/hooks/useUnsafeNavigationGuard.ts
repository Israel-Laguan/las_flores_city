'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

// Module-level dirty flag so other components (e.g. TopBar) can guard
// router-driven navigations like logout without coupling to this hook.
let __dialogueDirty = false;
export function isDialogueDirty(): boolean {
  return __dialogueDirty;
}
export function setDialogueDirty(value: boolean): void {
  __dialogueDirty = value;
}

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
 * Guards against losing unsaved edits on ANY client-side navigation away from
 * the current page, not just a single back link:
 *  - native reload / tab close (beforeunload)
 *  - browser back / forward (popstate)
 *  - in-app anchors including Next `<Link>` (capture-phase click handler)
 *  - programmatic router navigations (Next.js routeChangeStart)
 *
 * When the page is dirty, each transition asks for confirmation and is blocked
 * (or reverted, for popstate) unless the user confirms. Pass `dirty` from the
 * caller; it is read via a ref so the event listeners stay registered once.
 */
export function useUnsafeNavigationGuard(dirty: boolean): void {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track the current editor URL so we can restore it when the user declines navigation.
  // This must be updated on route changes because the App Router reuses the same
  // component instance when navigating between different [id] pages.
  const currentEditorHrefRef = useRef<string>('');
  // Last observed history entry index, kept in sync on every route change and
  // popstate so a declined Back/Forward can be compensated in the opposite
  // direction.
  const historyIndexRef = useRef<number>(-1);

  // Publish the shared dirty flag so other components (e.g. TopBar) can guard
  // router-driven exits such as logout — and clear it when this editor
  // unmounts, otherwise the next admin page would keep prompting for unsaved
  // dialogue changes.
  useEffect(() => {
    setDialogueDirty(dirty);
    return () => setDialogueDirty(false);
  }, [dirty]);

  // Update the current editor URL + history index whenever the route changes.
  useEffect(() => {
    currentEditorHrefRef.current = window.location.href;
    historyIndexRef.current = getHistoryIndex();
  }, [pathname, searchParams]);

  useEffect(() => {
    const message = 'You have unsaved changes. Leave anyway?';

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
      const goingForward = prevIndex >= 0 && index >= 0 && index > prevIndex;
      isReturningRef.current = true;
      window.history.go(goingForward ? -1 : 1);
    };

    const onRouteChangeStart = (_url: string) => {
      if (dirtyRef.current && !window.confirm(message)) {
        router.replace(currentEditorHrefRef.current);
      }
    };

    // Intercept internal anchor/<Link> navigations before Next/router handle
    // them. This covers the sidebar, breadcrumbs, back links, etc.
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank') return;
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
    // App Router does not expose a reliable synchronous `beforePopState`
    // interceptor in all versions, so browser back/forward is handled via
    // the `popstate` listener above. Programmatic router navigations are
    // intercepted via the click handler + `routeChangeStart` listener below.
    const routeChangeStart = (router as any)?.events?.on?.bind((router as any).events);
    if (typeof routeChangeStart === 'function') {
      routeChangeStart('routeChangeStart', onRouteChangeStart);
    }
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
      if (typeof routeChangeStart === 'function') {
        (router as any).events.off?.('routeChangeStart', onRouteChangeStart);
      }
    };
  }, [router]);
}
