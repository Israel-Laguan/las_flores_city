import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import TopBar from '../TopBar';
import { SidebarContext, type SidebarContextValue } from '../SidebarContext';

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
});
