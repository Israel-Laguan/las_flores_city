import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import Sidebar from '../Sidebar';
import { SidebarContext, type SidebarContextValue } from '../SidebarContext';

const defaultContext: SidebarContextValue = {
  mobileOpen: false,
  toggleMobile: () => {},
  closeMobile: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
};

function renderSidebar(context: Partial<SidebarContextValue> = {}) {
  return render(
    <SidebarContext.Provider value={{ ...defaultContext, ...context }}>
      <Sidebar />
    </SidebarContext.Provider>,
  );
}

beforeEach(() => {
  mockPathname = '/';
});

describe('Sidebar', () => {
  it('renders all four nav sections', () => {
    renderSidebar();
    for (const title of ['Content', 'Creation', 'Operations', 'Admin']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('renders top-level links with their hrefs', () => {
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Characters' })).toHaveAttribute('href', '/characters');
    expect(screen.getByRole('link', { name: 'Dialogues' })).toHaveAttribute('href', '/dialogues');
    expect(screen.getByRole('link', { name: 'Scenes' })).toHaveAttribute('href', '/scenes');
    expect(screen.getByRole('link', { name: 'Mysteries' })).toHaveAttribute('href', '/mysteries');
  });

  it('marks the active top-level link with aria-current="page"', () => {
    mockPathname = '/characters';
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Characters' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dialogues' })).not.toHaveAttribute('aria-current');
  });

  it('keeps sub-items hidden until the parent is expanded', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'New Beat' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Story Beats' }));

    expect(screen.getByRole('link', { name: 'New Beat' })).toHaveAttribute('href', '/story-beats/new');
    expect(screen.getByRole('link', { name: 'All Beats' })).toHaveAttribute('href', '/story-beats');
    expect(screen.getByRole('button', { name: 'Collapse Story Beats' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('auto-expands sub-items when a sub-route is active', () => {
    mockPathname = '/missions/new';
    renderSidebar();

    const newMission = screen.getByRole('link', { name: 'New Mission' });
    expect(newMission).toBeInTheDocument();
    expect(newMission).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Collapse Missions' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not put aria-current on parent links that have sub-items', () => {
    mockPathname = '/missions';
    renderSidebar();

    expect(screen.getByRole('link', { name: 'Missions' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'All Missions' })).toHaveAttribute('aria-current', 'page');
  });

  it('collapses sections when the section header is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /Admin/ }));
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Admin/ }));
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('invokes toggleCollapsed from the collapse button', () => {
    const toggleCollapsed = vi.fn();
    renderSidebar({ toggleCollapsed });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('labels the collapse button for expansion when collapsed', () => {
    renderSidebar({ collapsed: true });
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('invokes closeMobile when a nav link is clicked', () => {
    const closeMobile = vi.fn();
    renderSidebar({ closeMobile });
    fireEvent.click(screen.getByRole('link', { name: 'Characters' }));
    expect(closeMobile).toHaveBeenCalledTimes(1);
  });
});
