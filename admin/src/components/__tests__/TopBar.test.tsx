import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

let mockPathname = '/';
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: routerPush, refresh: vi.fn() }),
}));

import TopBar from '../TopBar';
import { SidebarContext, type SidebarContextValue } from '../SidebarContext';
import { setDialogueDirty } from '@/hooks/useUnsafeNavigationGuard';

const defaultContext: SidebarContextValue = {
  mobileOpen: false,
  toggleMobile: () => {},
  closeMobile: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
};

function renderTopBar(
  user: { username?: string; email?: string; role?: string } | null,
  context: Partial<SidebarContextValue> = {},
) {
  return render(
    <SidebarContext.Provider value={{ ...defaultContext, ...context }}>
      <TopBar user={user} />
    </SidebarContext.Provider>,
  );
}

beforeEach(() => {
  mockPathname = '/';
  routerPush.mockClear();
  setDialogueDirty(false);
});

afterEach(() => {
  setDialogueDirty(false);
  vi.restoreAllMocks();
});

describe('TopBar', () => {
  it('shows "Dashboard" on the home route', () => {
    renderTopBar({ username: 'tester', role: 'admin' });
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows the page title for the current route', () => {
    mockPathname = '/characters';
    renderTopBar({ username: 'tester', role: 'admin' });
    expect(screen.getByRole('heading', { level: 1, name: 'Characters' })).toBeInTheDocument();
  });

  it('prefers the most specific nav match for nested routes', () => {
    mockPathname = '/story-builder/plans';
    renderTopBar({ username: 'tester', role: 'admin' });
    expect(screen.getByRole('heading', { level: 1, name: 'Plans' })).toBeInTheDocument();
  });

  it('falls back to a prettified segment for unknown routes', () => {
    mockPathname = '/some-unknown-page';
    renderTopBar({ username: 'tester', role: 'admin' });
    expect(screen.getByRole('heading', { level: 1, name: 'Some Unknown Page' })).toBeInTheDocument();
  });

  it('renders user info and a logout button when signed in', () => {
    renderTopBar({ username: 'tester', role: 'admin' });
    expect(screen.getByText('tester')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
  });

  it('renders a login link when signed out', () => {
    renderTopBar(null);
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  });

  it('calls toggleMobile when the menu button is clicked', () => {
    const toggleMobile = vi.fn();
    renderTopBar({ username: 'tester', role: 'admin' }, { toggleMobile });
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(toggleMobile).toHaveBeenCalledTimes(1);
  });

  it('reflects the open state on the menu button', () => {
    renderTopBar({ username: 'tester', role: 'admin' }, { mobileOpen: true });
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
  });

  // Logout navigates via router.push, which no anchor/popstate guard can see,
  // so it must consult the shared dirty flag itself or unsaved edits are lost.
  describe('logout with unsaved dialogue edits', () => {
    it('aborts the logout when the user declines the confirmation', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      setDialogueDirty(true);
      renderTopBar({ username: 'tester', role: 'admin' });

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(routerPush).not.toHaveBeenCalled();
    });

    it('logs out when the user confirms', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      setDialogueDirty(true);
      renderTopBar({ username: 'tester', role: 'admin' });

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/login'));
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });

    it('does not prompt when there are no unsaved edits', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderTopBar({ username: 'tester', role: 'admin' });

      fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

      await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/login'));
      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });
});
