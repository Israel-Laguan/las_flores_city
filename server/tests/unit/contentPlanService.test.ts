import { ContentPlanService } from '../../src/services/ContentPlanService.js';
import type { LLMProvider, ExistingContentContext } from '../../src/services/LLMService.js';

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

// Mock queryOLTP to avoid database connection
jest.mock('../../src/database/connection.js', () => ({
  queryOLTP: jest.fn()
    .mockResolvedValueOnce({ rows: [{ id: 'char-1', name: 'Existing Character' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'scene-1', name: 'Existing Scene', district: 'downtown' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'dial-1', name: 'Existing Dialogue' }] }),
}));

describe('ContentPlanService', () => {
  it('should parse a description and return a valid ContentPlan', async () => {
    const service = new ContentPlanService(mockProvider);
    const plan = await service.parseDescription('Add a bartender named Diego', 'user-123');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].name).toBe('Diego');
    expect(plan.description).toBe('Add a bartender named Diego');
  });

  it('should pass existing context to LLM provider', async () => {
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
});
