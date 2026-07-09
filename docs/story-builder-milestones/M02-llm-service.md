# Milestone 2: LLM Service

> **Depends on**: [M01-shared-schema.md](M01-shared-schema.md)
> **Next**: [M03-content-plan-service.md](M03-content-plan-service.md)

## Context

The Story Builder needs an LLM to parse natural-language descriptions into structured `ContentPlan` objects. The project already has API keys for Gemini, Groq, and NVIDIA configured in `.env.example`. Rather than introducing new dependencies (OpenAI/Anthropic), we create a pluggable provider interface that supports these existing providers, plus a `MockProvider` for deterministic testing.

This follows **Option C (Pluggable LLM Provider)** from the design document.

## Goals

- [ ] Create `server/src/services/LLMService.ts` with the `LLMProvider` interface
- [ ] Implement `GeminiProvider` (uses `GEMINI_API_KEY`, `GEMINI_MODEL`)
- [ ] Implement `GroqProvider` (uses `GROQ_API_KEY`)
- [ ] Implement `MockProvider` (deterministic, for tests)
- [ ] Implement `createLLMProvider()` factory function
- [ ] Update `.env.example` to document `LLM_PROVIDER` and `LLM_MODEL`
- [ ] Verify build passes

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/src/services/LLMService.ts` | Create | Pluggable LLM provider interface + implementations |
| `.env.example` | Modify | Document `LLM_PROVIDER` and `LLM_MODEL` env vars |

## Implementation Details

### Provider Interface

```typescript
// server/src/services/LLMService.ts
import type { ContentPlan } from '@shared/index';

export interface ExistingContentContext {
  characters: Array<{ id: string; name: string }>;
  scenes: Array<{ id: string; name: string; district: string }>;
  dialogues: Array<{ id: string; name: string }>;
}

export interface LLMProvider {
  parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan>;
}
```

### GeminiProvider

Uses the Gemini REST API (`generativelanguage.googleapis.com`). The system prompt includes:
- Available content types and their required fields
- Existing character/scene/dialogue names (from context)
- Instructions to output JSON matching `ContentPlanSchema`
- Pre-generated UUIDs for each item (to prevent hallucination)

```typescript
export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY!;
    this.model = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';
  }

  async parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan> {
    const systemPrompt = buildSystemPrompt(context);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser description: ${description}` }] }
          ],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );
    // Parse response, validate against ContentPlanSchema
    const data = await response.json();
    const planJson = JSON.parse(data.candidates[0].content.parts[0].text);
    return ContentPlanSchema.parse(planJson);
  }
}
```

### GroqProvider

Uses the Groq REST API (`api.groq.com/openai/v1/chat/completions`), which is OpenAI-compatible.

```typescript
export class GroqProvider implements LLMProvider {
  // Similar to GeminiProvider but uses Groq's OpenAI-compatible endpoint
  // Model: 'llama-3.3-70b-versatile' or similar
}
```

### MockProvider

Returns a deterministic `ContentPlan` based on keywords in the description. Essential for unit tests.

```typescript
export class MockProvider implements LLMProvider {
  async parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan> {
    // Simple keyword matching: if "bartender" in description, create a character
    // If "at the Plaza" in description, update the Plaza scene
    // Returns a valid ContentPlan with pre-generated UUIDs
  }
}
```

### Factory Function

```typescript
export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || 'mock';
  switch (provider) {
    case 'gemini': return new GeminiProvider();
    case 'groq': return new GroqProvider();
    case 'mock': return new MockProvider();
    default: throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
```

### System Prompt Builder

```typescript
function buildSystemPrompt(context: ExistingContentContext): string {
  return `You are a content planning assistant for Las Flores 2077, a narrative game.
Available content types: character, dialogue, scene, overlay, mission, story, shop_item, location, map_tile, story_beat, gig, vault.

Existing characters: ${context.characters.map(c => c.name).join(', ')}
Existing scenes: ${context.scenes.map(s => s.name).join(', ')}

Given a user's description, create a ContentPlan with items to create or update.
Each item must have: id (UUID), type, action ('create'|'update'), name, slug, fields, assetNeeds, dependsOn.
Return JSON matching this schema: { id, description, items: [...], links: [...], status: 'draft' }`;
}
```

### `.env.example` Additions

```env
# Story Builder LLM Configuration
LLM_PROVIDER=mock              # mock | gemini | groq
LLM_MODEL=gemini-3-pro-preview # Used by Gemini provider
```

### Key Design Decisions

1. **Default to `mock`** — Safe default; no API calls unless explicitly configured
2. **Pre-generate UUIDs** — Pass UUIDs in the system prompt to prevent LLM hallucination of invalid UUIDs
3. **Validate LLM output** — Always run `ContentPlanSchema.parse()` on LLM response
4. **No new dependencies** — Use native `fetch` (Node 18+), no SDK installs needed
5. **Context-aware** — Pass existing content names so LLM can reference them

## Completion Checklist

Before proceeding to Milestone 3, verify:

- [ ] `server/src/services/LLMService.ts` exists with `LLMProvider` interface
- [ ] `GeminiProvider`, `GroqProvider`, `MockProvider` all implemented
- [ ] `createLLMProvider()` factory works with env var
- [ ] `MockProvider` returns a valid `ContentPlan` for a test description
- [ ] `.env.example` documents `LLM_PROVIDER` and `LLM_MODEL`
- [ ] `npm run build --workspace=server` passes
- [ ] `npm run lint --workspace=server` passes

## Next Milestone

→ [Milestone 3: Content Plan Service](M03-content-plan-service.md)