import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import Breadcrumbs from '../Breadcrumbs';
import { BreadcrumbProvider, useBreadcrumbLabel } from '../BreadcrumbContext';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

function Registrar({ id, label }: { id: string; label: string | null }) {
  useBreadcrumbLabel(id, label);
  return null;
}

function renderWith(pathname: string, registrar?: { id: string; label: string | null }) {
  mockPathname = pathname;
  return render(
    <BreadcrumbProvider>
      <Breadcrumbs />
      {registrar && <Registrar id={registrar.id} label={registrar.label} />}
    </BreadcrumbProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('Breadcrumbs', () => {
  it('renders nothing for a single-crumb path', () => {
    renderWith('/characters');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });

  it('renders the raw uuid verbatim (no dash-mangling) when unregistered', () => {
    renderWith(`/characters/${UUID}`);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Characters');
    expect(nav).toHaveTextContent(UUID);
    // The uuid must appear verbatim, not title-cased/dash-split.
    expect(nav).toHaveTextContent('550e8400-e29b-41d4-a716-446655440000');
  });

  it('renders the registered entity name for the leaf', () => {
    renderWith(`/characters/${UUID}`, { id: UUID, label: 'Ana Kim' });
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Ana Kim');
    expect(nav).not.toHaveTextContent(UUID);
  });

  it('renders a named link for the middle crumb and Edit as the leaf', () => {
    renderWith(`/characters/${UUID}/edit`, { id: UUID, label: 'Ana Kim' });
    const link = screen.getByRole('link', { name: 'Ana Kim' });
    expect(link).toHaveAttribute('href', `/characters/${UUID}`);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Edit');
  });

  it('humanizes non-uuid segments', () => {
    renderWith('/missions/new');
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('New');
  });

  it('restores the raw uuid when the registrar unmounts', () => {
    const { rerender } = renderWith(`/characters/${UUID}`, { id: UUID, label: 'Ana Kim' });
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Ana Kim');
    rerender(
      <BreadcrumbProvider>
        <Breadcrumbs />
      </BreadcrumbProvider>,
    );
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(UUID);
  });
});