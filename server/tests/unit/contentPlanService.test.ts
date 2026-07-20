import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ContentPlanService } from '../../src/services/ContentPlanService.js';
import type { LLMProvider, ExistingContentContext } from '../../src/services/types/LLMTypes.js';
import { queryOLTP } from '../../src/database/connection.js';

// Mock queryOLTP to avoid database connection
jest.mock('../../src/database/connection.js');

const mockQueryOLTP = jest.mocked(queryOLTP);

// Mock LLM provider
const mockProvider: LLMProvider = {
  async parseDescription(description: string, _context: ExistingContentContext) {
    return {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      description,
      items: [
        {
          id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
          type: 'character' as const,
          action: 'create' as const,
          name: 'Diego',
          slug: 'diego',
          fields: { description: 'A bartender at the Plaza' },
          assetNeeds: [{ promptType: 'portrait', targetField: 'portrait_urls[0].url', status: 'pending' as const }],
          dependsOn: [],
        },
      ],
      links: [],
      status: 'draft' as const,
    };
  },
};

beforeEach(() => {
  mockQueryOLTP.mockReset();
});

describe('ContentPlanService', () => {
  it('should parse a description and return a valid ContentPlan', async () => {
    mockQueryOLTP.mockResolvedValue({ rows: [] } as any);
    const service = new ContentPlanService(mockProvider);
    const plan = await service.parseDescription('Add a bartender named Diego', 'user-123');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].name).toBe('Diego');
    expect(plan.description).toBe('Add a bartender named Diego');
  });

  it('should pass existing context to LLM provider', async () => {
    mockQueryOLTP
      .mockResolvedValueOnce({ rows: [{ id: 'char-1', name: 'Existing Character' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'scene-1', name: 'Existing Scene', district: 'downtown' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'dial-1', name: 'Existing Dialogue' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'mis-1', title: 'Existing Mission' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'sto-1', name: 'Existing Story' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'ovl-1', name: 'Existing Overlay' }] } as any);

    const parseSpy = jest.fn().mockResolvedValue({
      id: '12345678-1234-1234-1234-123456789012',
      description: 'test',
      items: [],
      links: [],
      status: 'draft',
    });

    const provider: LLMProvider = { parseDescription: parseSpy };
    const service = new ContentPlanService(provider);

    await service.parseDescription('Test description', 'user-123');

    expect(parseSpy).toHaveBeenCalledWith(
      'Test description',
      expect.objectContaining({
        characters: expect.arrayContaining([
          expect.objectContaining({ name: 'Existing Character' }),
        ]),
      })
    );
  });

  it('gatherContext joins districts and does not query a locations table', async () => {
    // 6 DB queries (characters, scenes, dialogues, missions, stories, overlays).
    // Locations are sourced from content YAML, not a DB table.
    mockQueryOLTP
      .mockResolvedValueOnce({ rows: [{ id: 'char-1', name: 'C' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'scene-1', name: 'S', district: 'Downtown', mood: 'tense' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'd-1', name: 'Dialogue' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'm-1', title: 'Mission' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'st-1', name: 'Story' }] } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'o-1', name: 'Overlay' }] } as any);

    const service = new ContentPlanService(mockProvider);
    const ctx = await service.gatherContext();

    // scenes query must use the district JOIN (string district), not scenes.district column
    expect(ctx.scenes).toHaveLength(1);
    expect(ctx.scenes[0]).toMatchObject({ id: 'scene-1', name: 'S', district: 'Downtown', mood: 'tense' });
    // locations come from content YAML and must always be an array (never a DB row array)
    expect(Array.isArray(ctx.locations)).toBe(true);
    // Exactly 6 DB queries were issued; no query referenced a non-existent `locations` table.
    expect(mockQueryOLTP).toHaveBeenCalledTimes(6);
    for (const call of mockQueryOLTP.mock.calls) {
      expect(String(call[0]).toLowerCase()).not.toContain('from locations');
    }
  });
});
