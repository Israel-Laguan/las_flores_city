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
  it('renders all seven nav sections', () => {
    renderSidebar();
    for (const title of ['Authoring', 'Story Bible', 'Narrative', 'World', 'Dialogue', 'Tools', 'System']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('renders top-level links with their hrefs', () => {
    // 'Plans' is a sub-item of Story Builder — activate the parent route so it renders.
    mockPathname = '/story-builder';
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Pipeline' })).toHaveAttribute('href', '/pipeline');
    expect(screen.getByRole('link', { name: 'Story Builder' })).toHaveAttribute('href', '/story-builder');
    expect(screen.getByRole('link', { name: 'Plans' })).toHaveAttribute('href', '/story-builder/plans');
    expect(screen.getByRole('link', { name: 'Lore' })).toHaveAttribute('href', '/lore');
    expect(screen.getByRole('link', { name: 'Story Arc' })).toHaveAttribute('href', '/story-arc');
    expect(screen.getByRole('link', { name: 'Story Beats' })).toHaveAttribute('href', '/story-beats');
    expect(screen.getByRole('link', { name: 'Missions' })).toHaveAttribute('href', '/missions');
    expect(screen.getByRole('link', { name: 'Gigs' })).toHaveAttribute('href', '/gigs');
    expect(screen.getByRole('link', { name: 'Characters' })).toHaveAttribute('href', '/characters');
    expect(screen.getByRole('link', { name: 'Scenes' })).toHaveAttribute('href', '/scenes');
    expect(screen.getByRole('link', { name: 'Locations' })).toHaveAttribute('href', '/locations');
    expect(screen.getByRole('link', { name: 'Maps' })).toHaveAttribute('href', '/maps');
    expect(screen.getByRole('link', { name: 'Vault' })).toHaveAttribute('href', '/vault');
    expect(screen.getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    expect(screen.getByRole('link', { name: 'Dialogues' })).toHaveAttribute('href', '/dialogues');
    expect(screen.getByRole('link', { name: 'AI Config' })).toHaveAttribute('href', '/ai-config');
  });

  it('marks the active top-level link with aria-current="page"', () => {
    mockPathname = '/missions';
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Missions' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Lore' })).not.toHaveAttribute('aria-current');
  });

  it('keeps sub-items hidden until the parent is expanded', () => {
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'YAML Editor' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Content Ops' }));

    expect(screen.getByRole('link', { name: 'YAML Editor' })).toHaveAttribute('href', '/editor');
    expect(screen.getByRole('link', { name: 'Validation' })).toHaveAttribute('href', '/validation');
    expect(screen.getByRole('button', { name: 'Collapse Content Ops' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('auto-expands sub-items when a sub-route is active', () => {
    mockPathname = '/validation';
    renderSidebar();

    const validation = screen.getByRole('link', { name: 'Validation' });
    expect(validation).toBeInTheDocument();
    expect(validation).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Collapse Content Ops' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not put aria-current on parent links that have sub-items', () => {
    mockPathname = '/asset-coverage';

    renderSidebar();

    expect(screen.getByRole('link', { name: 'Asset Ops' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Coverage' })).toHaveAttribute('aria-current', 'page');
  });

  it('collapses sections when the section header is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /System/ }));
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /System/ }));
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
