import { LiteLLMProvider } from './LiteLLMProvider.js';
import { MockProvider } from './MockProvider.js';
import { buildSystemPrompt, buildRefinementPrompt, buildLorePrompt } from './LLMPrompts.js';
import type { ExistingContentContext, LLMProvider } from './types/LLMTypes.js';
export type { ExistingContentContext, LLMProvider };

// Re-export providers and prompt builders for backwards compatibility
export { LiteLLMProvider, MockProvider, buildSystemPrompt, buildRefinementPrompt, buildLorePrompt };

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || 'mock';
  switch (provider) {
    case 'mock':
      return new MockProvider();
    case 'litellm':
    case 'gemini':
    case 'groq':
      return new LiteLLMProvider();
    default:
      throw new Error(`Unknown LLM provider: ${provider}. Valid options: mock, litellm, gemini, groq`);
  }
}
