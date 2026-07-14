import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContentCard from '../components/ContentCard';
import type { ContentPlanItem } from '@las-flores/shared';

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
    fields: { name: 'Test Character', description: 'A test character', lore_path: 'docs/lore/test.md' },
    assetNeeds: [],
    dependsOn: [],
    ...overrides,
  };
}

describe('ContentCard lore regeneration', () => {
  it('should show Regenerate button when lore_path exists and onRegenerateLore is provided', () => {
    const onRegenerateLore = vi.fn();
    const item = createItem({ fields: { lore_path: 'docs/lore/test.md' } });
    render(<ContentCard item={item} index={0} planId="plan-123" onRegenerateLore={onRegenerateLore} onFieldChange={vi.fn()} onRemove={vi.fn()} />);
    
    expect(screen.getByText('Regenerate')).toBeInTheDocument();
  });

  it('should not show Regenerate button when onRegenerateLore is not provided', () => {
    const item = createItem({ fields: { lore_path: 'docs/lore/test.md' } });
    render(<ContentCard item={item} index={0} onFieldChange={vi.fn()} onRemove={vi.fn()} />);
    
    expect(screen.queryByText('Regenerate')).not.toBeInTheDocument();
  });

  it('should call onRegenerateLore with item id when clicked', () => {
    const onRegenerateLore = vi.fn();
    const item = createItem({ id: 'item-789', fields: { lore_path: 'docs/lore/test.md' } });
    render(<ContentCard item={item} index={0} planId="plan-123" onRegenerateLore={onRegenerateLore} onFieldChange={vi.fn()} onRemove={vi.fn()} />);
    
    fireEvent.click(screen.getByText('Regenerate'));
    expect(onRegenerateLore).toHaveBeenCalledWith('item-789');
  });

  it('should not show Regenerate button when lore_path is missing', () => {
    const onRegenerateLore = vi.fn();
    const item = createItem({ fields: {} });
    render(<ContentCard item={item} index={0} planId="plan-123" onRegenerateLore={onRegenerateLore} onFieldChange={vi.fn()} onRemove={vi.fn()} />);
    
    expect(screen.queryByText('Regenerate')).not.toBeInTheDocument();
  });
});
