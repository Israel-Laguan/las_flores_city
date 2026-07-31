import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('@/lib/themeEngine', () => ({
  getStoredTheme: vi.fn(() => 'dark'),
  applyTheme: vi.fn(),
  setTheme: vi.fn(),
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

  it('calls setTheme when dark button is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(themeEngine.setTheme).toHaveBeenCalledWith('dark');
  });

  it('calls setTheme when light button is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(themeEngine.setTheme).toHaveBeenCalledWith('light');
  });
});
