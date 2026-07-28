import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import LoreEditor from '../components/LoreEditor';

const mockAdminFetch = vi.fn();
vi.mock('@/lib/client-api', () => ({
  adminFetch: (...args: unknown[]) => mockAdminFetch(...args),
}));

describe('LoreEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows placeholder when no file selected', () => {
    render(<LoreEditor selectedPath={null} content={null} contentLoading={false} contentError={null} />);
    expect(screen.getByText('Select a file from the tree to view its content.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<LoreEditor selectedPath="test.md" content={null} contentLoading={true} contentError={null} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<LoreEditor selectedPath="test.md" content={null} contentLoading={false} contentError="Failed to load" />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('renders Edit button when viewing content', () => {
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('enters edit mode and shows textarea + Save/Cancel', async () => {
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('disables Save button when content is unchanged', async () => {
    const user = userEvent.setup();
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const saveBtn = screen.getByRole('button', { name: /Save/ });
    expect(saveBtn).toBeDisabled();
  });

  it('enables Save when content is modified', async () => {
    const user = userEvent.setup();
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, '# Modified');

    const saveBtn = screen.getByRole('button', { name: /Save/ });
    expect(saveBtn).not.toBeDisabled();
  });

  it('calls onSaved after successful save', async () => {
    mockAdminFetch.mockResolvedValueOnce({ success: true });
    const onSaved = vi.fn();

    const user = userEvent.setup();
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} onSaved={onSaved} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, '# Modified');

    await user.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => {
      expect(mockAdminFetch).toHaveBeenCalledWith('/admin/lore/file', {
        method: 'POST',
        body: JSON.stringify({ path: 'test.md', content: '# Modified' }),
      });
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows error when save fails', async () => {
    mockAdminFetch.mockResolvedValueOnce({ success: false, error: 'Permission denied' });

    const user = userEvent.setup();
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, '# Modified');

    await user.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });

  it('shows error when save request fails', async () => {
    mockAdminFetch.mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, '# Modified');

    await user.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });
  });

  it('Cancel returns to view mode', async () => {
    const user = userEvent.setup();
    render(<LoreEditor selectedPath="test.md" content="# Hello" contentLoading={false} contentError={null} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
