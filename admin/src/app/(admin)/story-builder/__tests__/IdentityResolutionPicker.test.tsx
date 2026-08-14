/**
 * Tests for IdentityResolutionPicker.tsx
 * Milestone 25: ambiguous identity alternatives picker (never silent merge).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import IdentityResolutionPicker, { type AmbiguousItem } from '../components/IdentityResolutionPicker';

const ambiguous = (name: string): AmbiguousItem => ({
  index: 0,
  name,
  type: 'character',
  resolution: {
    status: 'ambiguous',
    entityType: 'character',
    alternatives: [
      { kind: 'existing', id: 'a1930000-1111-4111-8111-111111111111', name: 'a193 Marcus', alias: 'Marcus' },
      { kind: 'new', name: 'new: Marcus II' },
    ],
  },
});

describe('IdentityResolutionPicker', () => {
  it('renders nothing when there are no ambiguous items', () => {
    render(
      <IdentityResolutionPicker items={[]} onResolve={vi.fn()} />,
    );
    expect(screen.queryByTestId('identity-resolution-picker')).not.toBeInTheDocument();
  });

  it('surfaces the alternatives for an ambiguous identity', () => {
    render(
      <IdentityResolutionPicker items={[ambiguous('Marcus')]} onResolve={vi.fn()} />,
    );
    expect(screen.getByText(/1 ambiguous identit/)).toBeInTheDocument();
    // The milestone alternatives shape: ["a193 Marcus", "new: Marcus II"]
    expect(screen.getByRole('button', { name: /a193 Marcus/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new: Marcus II/ })).toBeInTheDocument();
  });

  it('reports the chosen alternative to the resolver callback', () => {
    const onResolve = vi.fn();
    render(
      <IdentityResolutionPicker items={[ambiguous('Marcus')]} onResolve={onResolve} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /a193 Marcus/ }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    const [index, chosen] = onResolve.mock.calls[0];
    expect(index).toBe(0);
    expect(chosen.kind).toBe('existing');
    if (chosen.kind === 'existing') expect(chosen.id).toBe('a1930000-1111-4111-8111-111111111111');
  });

  it('pluralizes the heading for multiple ambiguous items', () => {
    const second: AmbiguousItem = { ...ambiguous('Marcus II'), index: 1, name: 'Marcus II' };
    render(
      <IdentityResolutionPicker items={[ambiguous('Marcus'), second]} onResolve={vi.fn()} />,
    );
    expect(screen.getByText(/2 ambiguous identit/)).toBeInTheDocument();
  });
});