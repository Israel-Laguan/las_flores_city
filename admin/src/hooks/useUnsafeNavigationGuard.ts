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

  useEffect(() => {
    setDialogueDirty(dirty);
  }, [dirty]);

  // Update the current editor URL whenever the route changes
  useEffect(() => {
    currentEditorHrefRef.current = window.location.href;
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
        return;
      }
      if (dirtyRef.current && !window.confirm(message)) {
        // `history.go(1)` returns to the forward entry without appending a
        // fresh history entry, so repeated Back presses do not pile up history.
        isReturningRef.current = true;
        window.history.go(1);
      }
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
