import type { ContentPlanItem } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext } from './types/LLMTypes.js';
import { buildFillFieldsPrompt } from './LLMPrompts.js';

// Free-text fields eligible for LLM filling per content type
const FILL_TARGETS: Record<string, string[]> = {
  character: ['description', 'metadata.personality', 'title'],
  scene: ['description', 'mood'],
  location: ['description', 'history', 'daytime', 'nightlife'],
  dialogue: ['description'],
  mission: ['description'],
  overlay: ['description'],
  vault: ['description'],
  gig: ['description', 'reward'],
  shop_item: ['description'],
};

export interface FillResult {
  fields: Record<string, string>;
  lore_refs?: string[];
}

function getNestedField(obj: any, path: string): any {
  return path.split('.').reduce((o: any, k: string) => o?.[k], obj);
}

function setNestedField(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Fill free-text YAML fields via LLM for a content plan item.
 *
 * Only targets fields that are still TODO placeholders or empty.
 * Returns the filled values and any suggested lore references.
 */
export async function fillFields(
  item: ContentPlanItem,
  context: ExistingContentContext,
  provider: LLMProvider,
): Promise<FillResult> {
  const targets = FILL_TARGETS[item.type];
  if (!targets || targets.length === 0) return { fields: {} };

  // Only fill fields that are still TODO or empty
  const unfilled = targets.filter(f => {
    const val = getNestedField(item.fields, f);
    return !val || val === '' || (typeof val === 'string' && val.startsWith('TODO'));
  });

  if (unfilled.length === 0) return { fields: {} };

  const prompt = buildFillFieldsPrompt(item, unfilled, context);
  const response = await provider.generateFill(prompt);

  // Validate: only accept values for the target fields we asked for
  const filteredFields: Record<string, string> = {};
  if (response?.fields) {
    for (const key of unfilled) {
      if (key in response.fields && typeof response.fields[key] === 'string') {
        filteredFields[key] = response.fields[key];
      }
    }
  }

  return {
    fields: filteredFields,
    lore_refs: response.lore_refs,
  };
}

/**
 * Merge filled values into an item's fields object.
 * Filled values override TODO placeholders but not user-provided values.
 */
export function mergeFilledFields(
  item: ContentPlanItem,
  filledFields: Record<string, string>,
): void {
  const filledPaths = new Set(item.filled_fields ?? []);
  for (const [path, value] of Object.entries(filledFields)) {
    const current = getNestedField(item.fields, path);
    // Only override if the current value is TODO or empty
    if (!current || current === '' || (typeof current === 'string' && current.startsWith('TODO'))) {
      setNestedField(item.fields, path, value);
      filledPaths.add(path);
    }
  }
  // Record provenance so the Review UI can distinguish LLM-filled from
  // author-provided values, and so edits survive the merge.
  item.filled_fields = Array.from(filledPaths);
}
