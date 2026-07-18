import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import MissionNewRedirect from '../page';

describe('missions/new redirect (M13)', () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it('redirects to /story-builder on mount', () => {
    render(<MissionNewRedirect />);
    expect(replaceMock).toHaveBeenCalledWith('/story-builder');
  });

  it('renders a redirecting notice', () => {
    render(<MissionNewRedirect />);
    expect(screen.getByText(/Redirecting to Story Builder/i)).toBeInTheDocument();
  });
});
