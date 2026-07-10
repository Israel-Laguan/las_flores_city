import { describe, it, expect } from '@jest/globals';
import { injectAssetNeeds } from '../../src/services/AssetNeedsService.js';

describe('AssetNeedsService', () => {
  it('injects asset needs for character type', () => {
    const items = [{ type: 'character' as const, assetNeeds: [] }];
    injectAssetNeeds(items);
    expect(items[0].assetNeeds).toHaveLength(2);
    expect(items[0].assetNeeds[0].promptType).toBe('portrait');
    expect(items[0].assetNeeds[1].promptType).toBe('biometric');
  });

  it('injects asset needs for scene type', () => {
    const items = [{ type: 'scene' as const, assetNeeds: [] }];
    injectAssetNeeds(items);
    expect(items[0].assetNeeds).toHaveLength(1);
    expect(items[0].assetNeeds[0].promptType).toBe('background');
  });

  it('injects asset needs for location type', () => {
    const items = [{ type: 'location' as const, assetNeeds: [] }];
    injectAssetNeeds(items);
    expect(items[0].assetNeeds).toHaveLength(2);
    expect(items[0].assetNeeds[0].promptType).toBe('image');
    expect(items[0].assetNeeds[1].promptType).toBe('background');
  });

  it('injects asset needs for overlay type', () => {
    const items = [{ type: 'overlay' as const, assetNeeds: [] }];
    injectAssetNeeds(items);
    expect(items[0].assetNeeds).toHaveLength(1);
    expect(items[0].assetNeeds[0].promptType).toBe('background');
  });

  it('does not inject for types without assets', () => {
    const typesWithoutAssets = ['dialogue', 'mission', 'story', 'shop_item', 'gig', 'vault', 'story_beat', 'map_tile'] as const;
    for (const type of typesWithoutAssets) {
      const items = [{ type, assetNeeds: [] }];
      injectAssetNeeds(items);
      expect(items[0].assetNeeds).toHaveLength(0);
    }
  });

  it('does not override existing asset needs', () => {
    const items = [{
      type: 'character' as const,
      assetNeeds: [{ promptType: 'custom', targetField: 'custom_field', status: 'pending' as const }],
    }];
    injectAssetNeeds(items);
    expect(items[0].assetNeeds).toHaveLength(1);
    expect(items[0].assetNeeds[0].promptType).toBe('custom');
  });

  it('returns copies so mutating injected needs does not affect the static map', () => {
    const items = [{ type: 'character' as const, assetNeeds: [] }];
    injectAssetNeeds(items);
    items[0].assetNeeds[0].promptType = 'modified';

    const items2 = [{ type: 'character' as const, assetNeeds: [] }];
    injectAssetNeeds(items2);
    expect(items2[0].assetNeeds[0].promptType).toBe('portrait');
  });

  it('handles mixed types in a single batch', () => {
    const items = [
      { type: 'character' as const, assetNeeds: [] },
      { type: 'dialogue' as const, assetNeeds: [] },
      { type: 'scene' as const, assetNeeds: [] },
    ];
    injectAssetNeeds(items);
    expect(items[0].assetNeeds).toHaveLength(2);
    expect(items[1].assetNeeds).toHaveLength(0);
    expect(items[2].assetNeeds).toHaveLength(1);
  });
});
