import { generateYaml, resolveFilePath } from '../../src/services/ContentSkeletonGenerator.js';
import type { ContentPlanItem } from '@las-flores/shared';

const createItem = (overrides: Partial<ContentPlanItem> = {}): ContentPlanItem => ({
  id: '12345678-1234-1234-1234-123456789012',
  type: 'character',
  action: 'create',
  name: 'Test Item',
  slug: 'test_item',
  fields: {},
  assetNeeds: [],
  dependsOn: [],
  ...overrides,
});

describe('ContentSkeletonGenerator', () => {
  describe('generateYaml', () => {
    it('should generate valid character YAML', () => {
      const item = createItem({
        type: 'character',
        name: 'Diego',
        slug: 'diego',
        fields: { description: 'A bartender', title: 'Bartender', metadata: { type: 'human', role: 'npc' } },
      });
      const result = generateYaml(item);
      expect(result).toContain('name: Diego');
      expect(result).toContain('id:');
      expect(result).toContain('description: A bartender');
    });

    it('should generate valid dialogue YAML with nodes', () => {
      const item = createItem({
        type: 'dialogue',
        name: 'Diego intro',
        slug: 'diego_intro',
        fields: { text: 'Hello there!' },
      });
      const result = generateYaml(item);
      expect(result).toContain('start_node_id: start');
      expect(result).toContain('nodes:');
      expect(result).toContain('Hello there!');
    });

    it('should generate valid scene YAML', () => {
      const item = createItem({
        type: 'scene',
        name: 'Central Plaza',
        slug: 'central_plaza',
        fields: { district: 'downtown', mood: 'vibrant' },
      });
      const result = generateYaml(item);
      expect(result).toContain('name: Central Plaza');
      expect(result).toContain('district: downtown');
      expect(result).toContain('mood: vibrant');
    });

    it('should generate valid overlay YAML', () => {
      const item = createItem({
        type: 'overlay',
        name: 'Diego overlay',
        slug: 'diego_overlay',
        fields: { target_tree_id: '12345678-1234-1234-1234-123456789012' },
      });
      const result = generateYaml(item);
      expect(result).toContain('target_tree_id:');
      expect(result).toContain('modifications: []');
    });

    it('should generate valid mission YAML', () => {
      const item = createItem({
        type: 'mission',
        name: 'Find the artifact',
        slug: 'find_artifact',
        fields: { description: 'Search for the ancient artifact' },
      });
      const result = generateYaml(item);
      expect(result).toContain('title: Find the artifact');
      expect(result).toContain('status: ACTIVE');
    });

    it('should generate valid story YAML', () => {
      const item = createItem({
        type: 'story',
        name: 'Main Quest',
        slug: 'main_quest',
        fields: { beats: ['beat1', 'beat2'] },
      });
      const result = generateYaml(item);
      expect(result).toContain('name: Main Quest');
      expect(result).toContain('beats:');
    });

    it('should generate valid shop_item YAML', () => {
      const item = createItem({
        type: 'shop_item',
        name: 'Health Potion',
        slug: 'health_potion',
        fields: { price: 100, currency: 'credits' },
      });
      const result = generateYaml(item);
      expect(result).toContain('name: Health Potion');
      expect(result).toContain('price: 100');
    });

    it('should generate valid location YAML', () => {
      const item = createItem({
        type: 'location',
        name: 'Plaza',
        slug: 'plaza',
        fields: { district: 'downtown', tags: ['landmark'] },
      });
      const result = generateYaml(item);
      expect(result).toContain('name: Plaza');
      expect(result).toContain('type: location');
      expect(result).toContain('district: downtown');
    });

    it('should generate valid map_tile YAML', () => {
      const item = createItem({
        type: 'map_tile',
        name: 'tile_0_0',
        slug: 'tile_0_0',
        fields: { district_id: '12345678-1234-1234-1234-123456789012', x: 0, y: 0, terrain_type: 'cobblestone' },
      });
      const result = generateYaml(item);
      expect(result).toContain('terrain_type: cobblestone');
      expect(result).toContain('x: 0');
    });

    it('should generate valid story_beat YAML', () => {
      const item = createItem({
        type: 'story_beat',
        name: 'City Arrival',
        slug: 'city_arrival',
        fields: { description: 'Player arrives in the city' },
      });
      const result = generateYaml(item);
      expect(result).toContain('description: Player arrives in the city');
    });

    it('should generate valid gig YAML', () => {
      const item = createItem({
        type: 'gig',
        name: 'Delivery Job',
        slug: 'delivery_job',
        fields: { reward: '500 credits' },
      });
      const result = generateYaml(item);
      expect(result).toContain('name: Delivery Job');
      expect(result).toContain('reward: 500 credits');
    });

    it('should generate valid vault YAML', () => {
      const item = createItem({
        type: 'vault',
        name: 'Ancient Key',
        slug: 'ancient_key',
        fields: { item_type: 'key' },
      });
      const result = generateYaml(item);
      expect(result).toContain('name: Ancient Key');
      expect(result).toContain('item_type: key');
    });

    it('should use TODO placeholders for missing fields', () => {
      const item = createItem({ type: 'character', fields: {} });
      const result = generateYaml(item);
      expect(result).toContain('TODO:');
    });
  });

  describe('resolveFilePath', () => {
    it('should resolve character file path with char_ prefix', () => {
      const item = createItem({ type: 'character', slug: 'diego' });
      expect(resolveFilePath(item)).toBe('characters/char_diego.yaml');
    });

    it('should resolve dialogue file path without prefix', () => {
      const item = createItem({ type: 'dialogue', slug: 'welcome' });
      expect(resolveFilePath(item)).toBe('dialogues/welcome.yaml');
    });

    it('should resolve scene file path', () => {
      const item = createItem({ type: 'scene', slug: 'central_plaza' });
      expect(resolveFilePath(item)).toBe('scenes/central_plaza.yaml');
    });

    it('should resolve overlay file path', () => {
      const item = createItem({ type: 'overlay', slug: 'diego_overlay' });
      expect(resolveFilePath(item)).toBe('overlays/diego_overlay.yaml');
    });

    it('should resolve mission file path', () => {
      const item = createItem({ type: 'mission', slug: 'find_artifact' });
      expect(resolveFilePath(item)).toBe('missions/find_artifact.yaml');
    });

    it('should resolve story file path', () => {
      const item = createItem({ type: 'story', slug: 'main_quest' });
      expect(resolveFilePath(item)).toBe('stories/main_quest.yaml');
    });

    it('should resolve shop_item file path', () => {
      const item = createItem({ type: 'shop_item', slug: 'health_potion' });
      expect(resolveFilePath(item)).toBe('shop/health_potion.yaml');
    });

    it('should resolve location file path', () => {
      const item = createItem({ type: 'location', slug: 'plaza' });
      expect(resolveFilePath(item)).toBe('locations/plaza.yaml');
    });

    it('should resolve map_tile file path', () => {
      const item = createItem({ type: 'map_tile', slug: 'tile_0_0' });
      expect(resolveFilePath(item)).toBe('maps/tile_0_0.yaml');
    });

    it('should resolve story_beat file path', () => {
      const item = createItem({ type: 'story_beat', slug: 'city_arrival' });
      expect(resolveFilePath(item)).toBe('story_beats.yaml');
    });

    it('should resolve gig file path', () => {
      const item = createItem({ type: 'gig', slug: 'delivery_job' });
      expect(resolveFilePath(item)).toBe('gigs/delivery_job.yaml');
    });

    it('should resolve vault file path', () => {
      const item = createItem({ type: 'vault', slug: 'ancient_key' });
      expect(resolveFilePath(item)).toBe('vault/ancient_key.yaml');
    });
  });
});
