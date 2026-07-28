import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiConfigPage from '../page';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/client-api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

const mockConfig = {
  provider: 'litellm',
  baseUrl: 'http://litellm:4000',
  apiKeyConfigured: true,
  apiKeyMasked: '••••key',
  model: 'poolside/laguna-m.1',
  timeoutMs: 60000,
  maxTimeoutMs: 300000,
  outlineModel: 'poolside/laguna-m.1',
  outlineMaxTokens: 4096,
  outlineInitialMaxItems: 15,
  outlineContextDepth: 'names',
  planOutlineMaxInputChars: 10000,
  planFillConcurrency: 3,
  planFillTimeoutMs: 120000,
  priceTableConfigured: false,
};

describe('AiConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockAdminFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AiConfigPage />);
    expect(screen.getByText('Loading AI configuration...')).toBeInTheDocument();
  });

  it('renders config values after fetch', async () => {
    mockAdminFetch.mockResolvedValueOnce({ success: true, data: mockConfig });
    render(<AiConfigPage />);

    await waitFor(() => {
      expect(screen.getByText('litellm')).toBeInTheDocument();
    });

    expect(screen.getByText('••••key')).toBeInTheDocument();
    expect(screen.getAllByText('poolside/laguna-m.1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('No')).toBeInTheDocument();   // priceTableConfigured
  });

  it('shows error when fetch fails', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<AiConfigPage />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders without API key configured', async () => {
    const noKeyConfig = { ...mockConfig, apiKeyConfigured: false, apiKeyMasked: 'not set' };
    mockAdminFetch.mockResolvedValueOnce({ success: true, data: noKeyConfig });
    render(<AiConfigPage />);

    await waitFor(() => {
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });
  });

  it('renders links section', async () => {
    mockAdminFetch.mockResolvedValueOnce({ success: true, data: mockConfig });
    render(<AiConfigPage />);

    await waitFor(() => {
      expect(screen.getByText('Reference')).toBeInTheDocument();
    });

    expect(screen.getByText('Prompt Guidelines')).toBeInTheDocument();
    expect(screen.getByText('Asset Prompt Catalog')).toBeInTheDocument();
  });
});
