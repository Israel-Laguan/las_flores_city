# Milestone 3: Content Plan Service

> **Depends on**: [M01-shared-schema.md](M01-shared-schema.md), [M02-llm-service.md](M02-llm-service.md)
> **Next**: [M04-skeleton-generator.md](M04-skeleton-generator.md)

## Context

The `ContentPlanService` is the main entry point for plan generation. It orchestrates the LLM call by:
1. Gathering existing content context (character names, scene names) from the OLTP database
2. Building a system prompt with available content types and existing content
3. Delegating parsing to the `LLMProvider`
4. Validating the LLM response against `ContentPlanSchema`
5. Returning the validated `ContentPlan`

This service is called by the server route (`POST /admin/story-builder/plan`).

## Goals

- [ ] Create `server/src/services/ContentPlanService.ts`
- [ ] Implement `parseDescription(description, userId)` returning `ContentPlan`
- [ ] Gather existing content context from OLTP database
- [ ] Write unit tests with mocked `LLMProvider`
- [ ] Verify lint and build pass

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/src/services/ContentPlanService.ts` | Create | Main entry point for plan generation |
| `server/tests/unit/contentPlanService.test.ts` | Create | Unit tests with mocked LLM |

## Implementation Details

### Service Structure

```typescript
// server/src/services/ContentPlanService.ts
import { ContentPlanSchema, type ContentPlan } from '@shared/index';
import { queryOLTP } from '../database/connection.js';
import { createLLMProvider, type LLMProvider, type ExistingContentContext } from './LLMService.js';

export class ContentPlanService {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    this.provider = provider || createLLMProvider();
  }

  async parseDescription(description: string, userId: string): Promise<ContentPlan> {
    // 1. Gather existing content context
    const context = await this.gatherContext(userId);

    // 2. Call LLM provider
    const plan = await this.provider.parseDescription(description, context);

    // 3. Validate against schema
    const validated = ContentPlanSchema.parse(plan);

    // 4. Ensure description matches input
    validated.description = description;

    return validated;
  }

  private async gatherContext(_userId: string): Promise<ExistingContentContext> {
    const [characters, scenes, dialogues] = await Promise.all([
      queryOLTP('SELECT id, name FROM characters ORDER BY name ASC'),
      queryOLTP('SELECT id, name, district FROM scenes ORDER BY name ASC'),
      queryOLTP('SELECT id, name FROM dialogue_trees ORDER BY name ASC'),
    ]);

    return {
      characters: characters.rows,
      scenes: scenes.rows,
      dialogues: dialogues.rows,
    };
  }
}

// Export singleton instance
export const contentPlanService = new ContentPlanService();
```

### Unit Test Structure

```typescript
// server/tests/unit/contentPlanService.test.ts
import { ContentPlanService } from '../../src/services/ContentPlanService.js';
import type { LLMProvider, ExistingContentContext } from '../../src/services/LLMService.js';

// Mock LLM provider
const mockProvider: LLMProvider = {
  async parseDescription(description: string, context: ExistingContentContext) {
    return {
      id: crypto.randomUUID(),
      description,
      items: [
        {
          id: crypto.randomUUID(),
          type: 'character',
          action: 'create',
          name: 'Diego',
          slug: 'diego',
          fields: { description: 'A bartender at the Plaza' },
          assetNeeds: [{ promptType: 'portrait', targetField: 'portrait_urls[0].url', status: 'pending' }],
          dependsOn: [],
        },
      ],
      links: [],
      status: 'draft',
    };
  },
};

describe('ContentPlanService', () => {
  it('should parse a description and return a valid ContentPlan', async () => {
    const service = new ContentPlanService(mockProvider);
    const plan = await service.parseDescription('Add a bartender named Diego');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].name).toBe('Diego');
  });
});
```

### Key Design Decisions

1. **Inject provider in constructor** — Allows passing a mock for tests
2. **Singleton export** — `contentPlanService` for use in routes
3. **Gather context from OLTP** — Uses `queryOLTP` (established pattern, no new pools)
4. **Validate LLM output** — `ContentPlanSchema.parse()` catches malformed LLM responses
5. **Override description** — Ensure the plan's `description` matches user input (not LLM's interpretation)

## Completion Checklist

Before proceeding to Milestone 4, verify:

- [ ] `server/src/services/ContentPlanService.ts` exists
- [ ] `parseDescription()` gathers context and calls LLM provider
- [ ] LLM response is validated against `ContentPlanSchema`
- [ ] Unit tests pass with mocked provider
- [ ] `npm run lint --workspace=server` passes
- [ ] `npm run build --workspace=server` passes

## Next Milestone

→ [Milestone 4: Content Skeleton Generator](M04-skeleton-generator.md)