import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('@/lib/themeEngine', () => ({
  getStoredTheme: vi.fn(() => 'dark'),
  applyTheme: vi.fn(),
  toggleTheme: vi.fn(() => 'light'),
  subscribeTheme: vi.fn(() => () => {}),
}));

import ThemeToggle from '../ThemeToggle';
import * as themeEngine from '@/lib/themeEngine';

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.className = '';
  });

  it('renders theme buttons', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
  });

  it('marks dark as active when stored theme is dark', () => {
    vi.mocked(themeEngine.getStoredTheme).mockReturnValue('dark');
    render(<ThemeToggle />);
    const darkBtn = screen.getByRole('button', { name: 'Dark' });
    const lightBtn = screen.getByRole('button', { name: 'Light' });
    expect(darkBtn.className).toContain('active');
    expect(lightBtn.className).not.toContain('active');
  });

  it('marks light as active when stored theme is light', () => {
    vi.mocked(themeEngine.getStoredTheme).mockReturnValue('light');
    render(<ThemeToggle />);
    const darkBtn = screen.getByRole('button', { name: 'Dark' });
    const lightBtn = screen.getByRole('button', { name: 'Light' });
    expect(lightBtn.className).toContain('active');
    expect(darkBtn.className).not.toContain('active');
  });

  it('calls toggleTheme when a button is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(themeEngine.toggleTheme).toHaveBeenCalledTimes(1);
  });
});
