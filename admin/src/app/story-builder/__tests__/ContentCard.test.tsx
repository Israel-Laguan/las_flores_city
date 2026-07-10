/**
 * Tests for ContentCard.tsx
 * Milestone 1: Story Builder UX Refinement
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContentCard from '../components/ContentCard';
import type { ContentPlanItem } from '@las-flores/shared';

// Mock LoreViewer to avoid its internal fetch calls
vi.mock('../components/LoreViewer', () => ({
  default: ({ lorePath, onClose, readOnly }: { lorePath: string; onClose: () => void; readOnly?: boolean }) => (
    <div data-testid="lore-viewer">
      <span data-testid="lore-path">{lorePath}</span>
      {readOnly && <span data-testid="read-only-flag">read-only</span>}
      <button onClick={onClose}>Close Lore</button>
    </div>
  ),
}));

function createItem(overrides: Partial<ContentPlanItem> = {}): ContentPlanItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    type: 'character',
    action: 'create',
    name: 'Test Character',
    slug: 'test_character',
    fields: { name: 'Test Character', description: 'A test character' },
    assetNeeds: [],
    dependsOn: [],
    ...overrides,
  };
}

describe('ContentCard rendering', () => {
  it('should render item name and type', () => {
    const item = createItem({ name: 'Diego', type: 'character', action: 'create' });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText(/Diego/)).toBeInTheDocument();
    // Check for the metadata span that shows "character · create"
    expect(screen.getByText(/character · create/)).toBeInTheDocument();
  });

  it('should show "Untitled" when name is empty', () => {
    const item = createItem({ name: '' });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText(/Untitled/)).toBeInTheDocument();
  });

  it('should render field inputs for character type', () => {
    const item = createItem({
      type: 'character',
      fields: { name: 'Diego', title: 'Bartender', description: 'A bartender' },
    });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByDisplayValue('Diego')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bartender')).toBeInTheDocument();
  });

  it('should render textarea for multiline fields', () => {
    const item = createItem({
      fields: { name: 'Test', description: 'Long description' },
    });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    const textarea = screen.getByDisplayValue('Long description');
    expect(textarea.tagName).toBe('TEXTAREA');
  });
});

describe('ContentCard interactions', () => {
  it('should call onRemove when Remove button is clicked', () => {
    const onRemove = vi.fn();
    const item = createItem();
    render(<ContentCard item={item} index={2} onFieldChange={vi.fn()} onRemove={onRemove} />);

    fireEvent.click(screen.getByText('Remove'));
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it('should call onFieldChange when input value changes', () => {
    const onFieldChange = vi.fn();
    const item = createItem({ fields: { name: 'Old Name' } });
    render(<ContentCard item={item} index={0} onFieldChange={onFieldChange} onRemove={vi.fn()} />);

    const input = screen.getByDisplayValue('Old Name');
    fireEvent.change(input, { target: { value: 'New Name' } });

    expect(onFieldChange).toHaveBeenCalledWith(0, 'name', 'New Name');
  });

  it('should call onFieldChange for nested field paths', () => {
    const onFieldChange = vi.fn();
    const item = createItem({
      type: 'character',
      fields: { metadata: { personality: 'brave' } },
    });
    render(<ContentCard item={item} index={1} onFieldChange={onFieldChange} onRemove={vi.fn()} />);

    const input = screen.getByDisplayValue('brave');
    fireEvent.change(input, { target: { value: 'cautious' } });

    expect(onFieldChange).toHaveBeenCalledWith(1, 'metadata.personality', 'cautious');
  });
});

describe('ContentCard lore and narrative buttons', () => {
  it('should show Lore button when lore_path is present', () => {
    const item = createItem({ fields: { lore_path: 'docs/lore/figures/diego.md' } });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('Lore')).toBeInTheDocument();
  });

  it('should not show Lore button when lore_path is missing', () => {
    const item = createItem({ fields: {} });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.queryByText('Lore')).not.toBeInTheDocument();
  });

  it('should show Narrative button when narrative_path is present', () => {
    const item = createItem({ fields: { narrative_path: 'content/characters/char_diego.md' } });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('Narrative')).toBeInTheDocument();
  });

  it('should open LoreViewer when Lore button is clicked', () => {
    const item = createItem({ fields: { lore_path: 'docs/lore/figures/diego.md' } });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByText('Lore'));
    expect(screen.getByTestId('lore-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('lore-path')).toHaveTextContent('docs/lore/figures/diego.md');
  });

  it('should open LoreViewer as read-only when Narrative button is clicked', () => {
    const item = createItem({ fields: { narrative_path: 'content/characters/char_diego.md' } });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByText('Narrative'));
    expect(screen.getByTestId('lore-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('read-only-flag')).toBeInTheDocument();
  });

  it('should close LoreViewer when close button is clicked', () => {
    const item = createItem({ fields: { lore_path: 'docs/lore/figures/diego.md' } });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByText('Lore'));
    expect(screen.getByTestId('lore-viewer')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close Lore'));
    expect(screen.queryByTestId('lore-viewer')).not.toBeInTheDocument();
  });
});

describe('ContentCard asset needs', () => {
  it('should render asset needs section when assetNeeds is not empty', () => {
    const item = createItem({
      assetNeeds: [{ promptType: 'portrait', targetField: 'portrait_urls[0].url', status: 'pending' }],
    });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('Assets Needed')).toBeInTheDocument();
    expect(screen.getByText(/portrait/)).toBeInTheDocument();
  });

  it('should not render asset needs section when empty', () => {
    const item = createItem({ assetNeeds: [] });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.queryByText('Assets Needed')).not.toBeInTheDocument();
  });

  it('should show Generate Image button when no asset path', () => {
    const item = createItem({
      assetNeeds: [{ promptType: 'portrait', targetField: 'portrait_urls[0].url', status: 'pending' }],
    });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('Generate Image')).toBeInTheDocument();
  });

  it('should show Replace Image button when asset path exists', () => {
    const item = createItem({
      assetNeeds: [{ promptType: 'portrait', targetField: 'portrait_urls[0].url', status: 'assigned' }],
      fields: { asset_paths: { portrait: 'characters/diego/portrait.png' } },
    });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('Replace Image')).toBeInTheDocument();
  });

  it('should render Remove button for asset when onAssetPathRemove is provided', () => {
    const item = createItem({
      assetNeeds: [{ promptType: 'portrait', targetField: 'portrait_urls[0].url', status: 'assigned' }],
      fields: { asset_paths: { portrait: 'characters/diego/portrait.png' } },
    });
    render(
      <ContentCard
        item={item}
        index={0}
        onFieldChange={vi.fn()}
        onRemove={vi.fn()}
        onAssetPathRemove={vi.fn()}
      />
    );

    // Should have two Remove buttons - one for card, one for asset
    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons.length).toBe(2);
  });

  it('should not render asset Remove button when onAssetPathRemove is not provided', () => {
    const item = createItem({
      assetNeeds: [{ promptType: 'portrait', targetField: 'portrait_urls[0].url', status: 'assigned' }],
      fields: { asset_paths: { portrait: 'characters/diego/portrait.png' } },
    });
    render(
      <ContentCard
        item={item}
        index={0}
        onFieldChange={vi.fn()}
        onRemove={vi.fn()}
        // onAssetPathRemove not provided
      />
    );

    // Should have only one Remove button (for the card)
    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons.length).toBe(1);
  });
});
