'use client';

import { useEffect, useRef } from 'react';

/**
 * Guards against losing unsaved edits on ANY client-side navigation away from
 * the current page, not just a single back link:
 *  - native reload / tab close (beforeunload)
 *  - browser back / forward (popstate)
 *  - in-app anchors including Next `<Link>` (capture-phase click handler)
 *
 * When the page is dirty, each transition asks for confirmation and is blocked
 * (or reverted, for popstate) unless the user confirms. Pass `dirty` from the
 * caller; it is read via a ref so the event listeners stay registered once.
 */
export function useUnsafeNavigationGuard(dirty: boolean): void {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const message = 'You have unsaved changes. Leave anyway?';

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    // popstate fires AFTER the address has already changed to the previous
    // history entry and cannot be prevented, so on a dirtied page we restore the
    // prior editor route if the user declines. We must push the editor's own URL
    // (captured at mount), NOT `window.location.href` — by the time this handler
    // runs the address already points at the page we navigated away to.
    const editorHref = window.location.href;
    const onPopState = () => {
      if (dirtyRef.current && !window.confirm(message)) {
        window.history.pushState(history.state, '', editorHref);
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
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
    };
  }, []);
}
