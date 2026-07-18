import { ContentPlanSchema, type ContentPlan, type ContentPlanItem } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext } from './types/LLMTypes.js';
import { buildLorePrompt, buildRefinementPrompt, buildSystemPrompt } from './LLMPrompts.js';

export class LiteLLMProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000';
    this.apiKey = process.env.LITELLM_API_KEY || '';
    this.model = process.env.LLM_MODEL || 'poolside/laguna-m.1';
  }

  private async callLLM(systemPrompt: string, userMessage: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LiteLLM request failed: ${response.status} ${response.statusText} — ${text}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LiteLLM response did not contain any message content.');
    }
    const fenceMatch = content.match(/```(?:json|JSON)\s*\n?([\s\S]*?)```/);
    const cleanedContent = fenceMatch ? fenceMatch[1].trim() : content.trim();
    try {
      return JSON.parse(cleanedContent);
    } catch (e) {
      throw new Error(`LiteLLM returned invalid JSON: ${(e as Error).message}. Content preview: ${cleanedContent.substring(0, 200)}`);
    }
  }

  private async callLLMText(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LiteLLM lore request failed: ${response.status} ${response.statusText} — ${text}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    if (content.startsWith('```markdown') || content.startsWith('```')) {
      const fenceMatch = content.match(/```(?:markdown)?\s*\n?([\s\S]*?)```/);
      content = fenceMatch ? fenceMatch[1] : content;
    }

    return content.trim();
  }

  async parseDescription(description: string, context: ExistingContentContext): Promise<ContentPlan> {
    const systemPrompt = buildSystemPrompt(context);
    const planJson = await this.callLLM(systemPrompt, description);
    return ContentPlanSchema.parse(planJson);
  }

  async refinePlan(existingPlan: ContentPlan, feedback: string, context: ExistingContentContext): Promise<ContentPlan> {
    const systemPrompt = buildRefinementPrompt(existingPlan, feedback, context);
    const planJson = await this.callLLM(systemPrompt, feedback);
    planJson.id = existingPlan.id;
    return ContentPlanSchema.parse(planJson);
  }

  async generateLore(item: ContentPlanItem, context: ExistingContentContext): Promise<string> {
    const prompt = buildLorePrompt(item, context);
    return this.callLLMText(prompt, item.fields.description || item.name);
  }

  async generateFill(prompt: string): Promise<{ fields: Record<string, string>; lore_refs?: string[] }> {
    const response = await this.callLLM('You are a content writer for Las Flores 2077.', prompt);
    return {
      fields: (response.fields as Record<string, string>) || {},
      lore_refs: Array.isArray(response.lore_refs) ? response.lore_refs : [],
    };
  }

}