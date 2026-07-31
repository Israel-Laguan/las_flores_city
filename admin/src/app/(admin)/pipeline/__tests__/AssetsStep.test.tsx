import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AssetsStep from '../components/steps/AssetsStep';
import type { PipelineAssetCoverage } from '../hooks/usePipeline';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/client-api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

const sampleChar1 = { id: 'char-1', name: 'Diego', slug: 'diego', hasPortrait: true, portraitUrls: [{ url: 'https://minio.test/diego__default.png' }, { url: 'https://minio.test/diego__v2.png' }] };
const sampleChar2 = { id: 'char-2', name: 'Ryu', slug: 'ryu', hasPortrait: false, portraitUrls: [] };
const sampleScene1 = { id: 'scene-1', name: 'The Wasteland', slug: 'the-wasteland', hasBackground: true, backgroundUrl: 'https://minio.test/wasteland__bg.png' };
const sampleScene2 = { id: 'scene-2', name: 'Neon Alley', slug: 'neon-alley', hasBackground: false, backgroundUrl: null };

const sampleCoverage: PipelineAssetCoverage = {
  characters: [sampleChar1, sampleChar2],
  scenes: [sampleScene1, sampleScene2],
};

describe('AssetsStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step title and description', () => {
    render(<AssetsStep assetCoverage={null} loading={false} onFetch={vi.fn()} />);
    expect(screen.getByText('4. Assets')).toBeInTheDocument();
    expect(screen.getByText(/Review asset coverage/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AssetsStep assetCoverage={null} loading={true} onFetch={vi.fn()} />);
    expect(screen.getByText('Loading asset coverage...')).toBeInTheDocument();
  });

  it('shows empty state when no coverage and not loading', () => {
    render(<AssetsStep assetCoverage={null} loading={false} onFetch={vi.fn()} />);
    // The muted message contains "Click <strong>Refresh Coverage</strong>",
    // and the button also says "Refresh Coverage" — use getAllByText
    const refreshEls = screen.getAllByText('Refresh Coverage');
    expect(refreshEls.length).toBeGreaterThanOrEqual(2);
  });

  it('auto-fetches on first render when coverage is null', () => {
    const onFetch = vi.fn();
    render(<AssetsStep assetCoverage={null} loading={false} onFetch={onFetch} />);
    expect(onFetch).toHaveBeenCalledTimes(1);
  });

  it('does not auto-fetch when coverage is already loaded', () => {
    const onFetch = vi.fn();
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={onFetch} />);
    expect(onFetch).not.toHaveBeenCalled();
  });

  it('renders coverage table with entity rows', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    expect(screen.getByText('Diego')).toBeInTheDocument();
    expect(screen.getByText('Ryu')).toBeInTheDocument();
    expect(screen.getByText('The Wasteland')).toBeInTheDocument();
    expect(screen.getByText('Neon Alley')).toBeInTheDocument();
  });

  it('shows summary counts', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    // Summary uses <strong> tags inside <span> — get the strong elements
    const strongs = screen.getAllByRole('strong');
    // First strong: total entities (4), second: ready count (2), third: missing count (2)
    const values = strongs.map(el => el.textContent);
    expect(values.length).toBe(3);
    expect(strongs[0]).toHaveTextContent('4');  // 4 total entities
    expect(strongs[1]).toHaveTextContent('2');  // 2 with assets (Diego + Wasteland)
    expect(strongs[2]).toHaveTextContent('2');  // 2 missing assets (Ryu + Neon Alley)
  });

  it('renders type badges', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    expect(screen.getAllByText('Char').length).toBe(2);
    expect(screen.getAllByText('Scene').length).toBe(2);
  });

  it('shows Ready status for entities with assets', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    const readyEls = screen.getAllByText('✅ Ready');
    expect(readyEls.length).toBe(2); // Diego + The Wasteland
  });

  it('shows Missing status for entities without assets', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    const missingEls = screen.getAllByText('❌ Missing');
    expect(missingEls.length).toBe(2); // Ryu + Neon Alley
  });

  it('renders entity links', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    const diegoLink = screen.getByRole('link', { name: 'Diego' });
    expect(diegoLink).toHaveAttribute('href', '/characters/char-1');
    const sceneLink = screen.getByRole('link', { name: 'The Wasteland' });
    expect(sceneLink).toHaveAttribute('href', '/scenes/scene-1');
  });

  it('renders preview images for entities with assets', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBe(2); // Diego + The Wasteland
    expect(images[0]).toHaveAttribute('src', 'https://minio.test/diego__default.png');
  });

  it('renders set-default dropdown for characters with multiple portraits', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.length).toBe(3); // placeholder + 2 portraits
    expect(options[1]).toHaveTextContent('Portrait #1');
    expect(options[2]).toHaveTextContent('Portrait #2');
  });
});

describe('AssetsStep — interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls assign-asset endpoint when set-default is selected', async () => {
    mockAdminFetch.mockResolvedValueOnce({ success: true });
    const onFetch = vi.fn();
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={onFetch} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'https://minio.test/diego__v2.png' } });

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith('/admin/content/assign-asset', expect.objectContaining({
        method: 'POST',
      }));
    });

    const body = JSON.parse(mockAdminFetch.mock.calls[0][1].body);
    expect(body.contentPath).toBe('characters/diego/char_diego.yaml');
    expect(body.fieldPath).toBe('portrait_urls[0].url');
    expect(body.assetUrl).toBe('https://minio.test/diego__v2.png');
  });

  it('shows error on assign-asset failure', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'https://minio.test/diego__v2.png' } });

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders Set Default button for scene with background', () => {
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);
    expect(screen.getByText('Set Default')).toBeInTheDocument();
  });

  it('triggers assign-asset when Set Default button is clicked for scene', async () => {
    mockAdminFetch.mockResolvedValueOnce({ success: true });
    render(<AssetsStep assetCoverage={sampleCoverage} loading={false} onFetch={vi.fn()} />);

    // Click the Set Default button for The Wasteland scene
    const buttons = screen.getAllByText('Set Default');
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith('/admin/content/assign-asset', expect.any(Object));
    });

    const body = JSON.parse(mockAdminFetch.mock.calls[0][1].body);
    expect(body.contentPath).toBe('scenes/the-wasteland/scene_the-wasteland.yaml');
    expect(body.fieldPath).toBe('background_url');
  });

  it('opens Asset Generation link', () => {
    render(<AssetsStep assetCoverage={null} loading={false} onFetch={vi.fn()} />);
    const link = screen.getByRole('link', { name: 'Open Asset Generation →' });
    expect(link).toHaveAttribute('href', '/assets');
  });
});
