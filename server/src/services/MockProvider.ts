import { GraphDeltaSchema, type ContentPlan, type ContentPlanItem, type IntakeConflictPreview, type CritiqueAnnotation, type GraphDelta, type GraphDeltaEdge, type ChatMessage, type ConflictChatContext } from '@las-flores/shared';
import type { LLMProvider, ExistingContentContext, LLMUsage, CritiqueScopeType, IntakeDiagnosticItem } from './types/LLMTypes.js';
import { gatherExistingContentContext } from './ContentContext.js';
import { templatedSuggestion } from './llmPromptsIntakeDiagnostics.js';

/** Map an evidence `nodeType` (often lowercase) to a `GraphNodeType` enum value. */
const NODE_TYPE_CAPS: Record<string, string> = {
  character: 'Character', scene: 'Scene', dialogue: 'Dialogue',
  mission: 'Mission', overlay: 'Overlay', location: 'Location', district: 'District',
};

/** UUID shape (case-insensitive) — MODIFY requires a canonical UUID nodeId. */
const MOCK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mockNodeType(t: string): string {
  return NODE_TYPE_CAPS[t.trim().toLowerCase()] || 'Character';
}

export class MockProvider implements LLMProvider {
  async gatherContext(): Promise<ExistingContentContext> {
    return gatherExistingContentContext();
  }
  async generateLore(item: ContentPlanItem, _context: ExistingContentContext): Promise<string> {
    const name = item.name || 'Untitled';
    const description = item.fields.description || '';

    switch (item.type) {
      case 'character':
        return `# ${name}

**Title (full):** ${item.fields.title || name}
**Title (short):** ${name}, ${item.fields.title || 'Person of Interest'}

**Description (full):**
**Age:** ${item.fields.age || 'Unknown'}
**Origin:** ${item.fields.origin || 'Las Flores urban sprawl'}
**Occupation:** ${item.fields.occupation || item.fields.title || 'Unspecified'}

${description || `${name} moves through the neon-soaked streets of Las Flores with purpose.`} Physically, they carry the marks of city life — cybernetic mods, weathered clothing, and eyes that have seen too much. Their personality is shaped by the struggles of urban survival, yet they retain a spark of something more.

Challenges: The daily grind of corporate oppression, the cost of staying augmented, and the question of what it means to remain human in 2077. Their larger vision is survival, perhaps even thriving, in a city that seems designed to grind people down.

---

**Key Relationships**

| Name | Nature | Notes |
|------|--------|-------|
| Unknown | Connection | To be determined by the GM |

**Known Habit**

${name} has a habit of scanning the crowd for familiar faces, a remnant of old-world community ties that persist despite the digital age.
`;
      case 'scene':
      case 'location':
        return `# ${name}

> Tags: ${item.fields.tags || 'urban'}

**District:** ${item.fields.district || 'Unknown'}

## Overview

${description || `${name} is a notable location in the cityscape of Las Flores.`} The area pulses with ${item.fields.mood || 'electric energy'}, its streets lined with vendors and corporate storefronts. Rain slicks the pavement, reflecting the kaleidoscope of neon above.

## Related Lore

- [[figures/unknown_person/unknown_person]]
`;
      case 'mission':
      case 'story':
        return `# ${name}

> Tags: ${item.fields.tags || 'main'}

**Location:** ${item.fields.location || 'Las Flores'}
**Period:** ${item.fields.period || '2077'}

## Overview

${description || `A ${item.type} unfolds in the shadows of Las Flores.`}

### Beats

- The story begins with an encounter.
- Complications arise from corporate interference.
- The climax reveals hidden truths.

## Related Lore

- [[figures/unknown_person/unknown_person]]
`;
      default:
        return `# ${name}

${description || `${name} is a ${item.type} in the world of Las Flores 2077.`}
`;
    }
  }

  /**
   * Build a normalized existing-canon name map (case-insensitive, trimmed,
   * first-occurrence wins) shared by the intake-conflict and semantic-critique
   * mocks so the two never diverge. Preserves the matched entity's type and
   * display name so conflict annotations can reference the *canon* entity's
   * type (not the proposed item's type) and canonical slug.
   */
  private buildExistingNameMap(context: ExistingContentContext): Map<string, { type: string; name: string }> {
    const existingByName = new Map<string, { type: string; name: string }>();
    const add = (type: string, name: string) => {
      const norm = (name || '').toLowerCase().trim();
      if (norm && !existingByName.has(norm)) existingByName.set(norm, { type, name: (name || '').trim() });
    };
    context.characters.forEach((c) => add('character', c.name));
    context.scenes.forEach((s) => add('scene', s.name));
    context.dialogues.forEach((d) => add('dialogue', d.name));
    context.missions.forEach((m) => add('mission', m.title));
    context.overlays.forEach((o) => add('overlay', o.name));
    context.locations.forEach((l) => add('location', l.name));
    return existingByName;
  }

  async analyzeIntakeConflicts(plan: ContentPlan, context: ExistingContentContext): Promise<{ conflicts: IntakeConflictPreview[]; usage: LLMUsage | null }> {
    const conflicts: IntakeConflictPreview[] = [];
    // Build a normalized-name -> existing display name map. Names are trimmed on
    // both sides so equivalent names with surrounding whitespace are detected
    // consistently (plan names are trimmed before comparison).
    const existingByName = this.buildExistingNameMap(context);

    // Deterministic surrogate: flag plan items whose name collides with existing
    // canon. Only `create` items allocate a new slug, so an `update` that
    // intentionally targets an existing entity must not be flagged as a conflict.
    for (const item of plan.items) {
      if (item.action !== 'create') continue;
      const norm = (item.name || '').toLowerCase().trim();
      const matched = norm ? existingByName.get(norm) : undefined;
      if (matched) {
        conflicts.push({
          type: 'duplicate_name',
          severity: 'error',
          description: `"${item.name}" matches an existing entity "${matched.name}" in canon.`,
          relatedItems: [item.id],
          // Preserve the matched existing display name so consumers can identify
          // the canon entity (not the proposed spelling).
          relatedExisting: [matched.name],
        });
      }
    }

    return { conflicts, usage: null };
  }

  /**
   * M26 — Deterministic mock of the deep semantic critique.
   *
   * Mirrors the intake duplicate-name detection but returns structured
   * `:Conflict` / `:Suggestion` annotation nodes with evidence excerpts, so the
   * AICritiqueService + admin overlays can be exercised end-to-end without an LLM.
   */
  async analyzePlanForConflicts(
    plan: ContentPlan,
    context: ExistingContentContext,
    scope: CritiqueScopeType,
  ): Promise<{ annotations: CritiqueAnnotation[]; usage: LLMUsage | null }> {
    const annotations: CritiqueAnnotation[] = [];

    // Build a normalized existing-name map (case-insensitive, trimmed) the same
    // way the intake mock does.
    const existingByName = this.buildExistingNameMap(context);

    // Deterministic surrogate (same rule as intake): flag a *create* item whose
    // name collides with existing canon as a high-confidence :Conflict.
    for (const item of plan.items) {
      if (item.action !== 'create') continue;
      const norm = (item.name || '').toLowerCase().trim();
      const matched = norm ? existingByName.get(norm) : undefined;
      if (!matched) continue;

      const excerpt = `${item.name} — ${(item.description || item.fields?.description || '').toString().substring(0, 160)}`.substring(0, 200);
      annotations.push({
        id: crypto.randomUUID(),
        type: 'conflict',
        severity: 'error',
        description: `"${item.name}" collides with existing "${matched.name}" in canon. This create item would allocate a duplicate entity.`,
        evidence: [{
          nodeType: item.type,
          nodeId: item.id,
          slug: item.slug || '',
          excerpt,
          field: 'name',
        }],
        // Reference the canon entity's own type + canonical slug, not the proposed
        // item's type (a duplicate name may belong to a different category).
        relatedEntities: [{ entityType: matched.type, slug: matched.name.toLowerCase().replace(/\s+/g, '_') }],
        scope,
        aiModel: 'mock',
        inputHash: '',
        status: 'open',
        planId: plan.id,
        itemIds: [item.id],
        createdAt: new Date().toISOString(),
      });
      }

    // A deterministic cross-entity/cross-mission :Suggestion to demonstrate the two-model split.
    if (scope !== 'entity') {
      const scopeLabel = scope === 'cross_mission' ? 'cross-mission' : 'cross-entity';
      annotations.push({
        id: crypto.randomUUID(),
        type: 'suggestion',
        severity: 'info',
        description: `No ${scopeLabel} contradictions detected by the mock; consider a human narrative review before approve.`,
        evidence: [],
        relatedEntities: [],
        scope,
        aiModel: 'mock',
        inputHash: '',
        status: 'open',
        planId: plan.id,
        itemIds: [],
        createdAt: new Date().toISOString(),
      });
    }

    return { annotations, usage: null };
  }

  /** The mock always uses a single fixed model for every scope. */
  critiqueModel(_scope: CritiqueScopeType): string {
    return 'mock';
  }

  async chatExplain(
    planId: string,
    messages: ChatMessage[],
    _context: ExistingContentContext,
    conflict?: ConflictChatContext,
    _planDescription?: string,
  ): Promise<{ reply: string; usage: LLMUsage | null }> {
    const last = messages[messages.length - 1]?.content ?? '';
    const subject = conflict
      ? `the active ${conflict.type} "${conflict.description}"`
      : 'the plan in context';
    return {
      reply: `Mock explanation for plan ${planId} concerning ${subject}. Your question was: "${last}". (Deterministic mock — configure LLM_PROVIDER=litellm for real generation.)`,
      usage: null,
    };
  }

  async chatPropose(
    planId: string,
    messages: ChatMessage[],
    _context: ExistingContentContext,
    conflict?: ConflictChatContext,
    _planDescription?: string,
    existingDeltas?: GraphDelta[],
  ): Promise<{ reply: string; deltas: GraphDelta[]; deltaEdges: GraphDeltaEdge[]; usage: LLMUsage | null }> {
    const ev = conflict?.evidence?.[0];
    let deltas: GraphDelta[];
    if (ev && MOCK_UUID_RE.test(ev.nodeId)) {
      deltas = [GraphDeltaSchema.parse({
        id: crypto.randomUUID(),
        planId,
        nodeType: mockNodeType(ev.nodeType) as GraphDelta['nodeType'],
        nodeId: ev.nodeId,
        op: 'MODIFY',
        fields: {
          description: `Mock-proposed MODIFY resolving the active conflict (was flagged via ${ev.slug || ev.nodeId}).`,
        },
        createdAt: new Date().toISOString(),
      })];
    } else if (existingDeltas && existingDeltas.length > 0) {
      // Deterministic remake: if a plan-local delta's name matches a token from
      // the instruction, MODIFY that delta in place (reuse its nodeId so
      // applyDelta MERGEs). Otherwise ADD a fresh entity. This exercises the
      // unscoped amend path offline without a real LLM.
      const instr = (messages[messages.length - 1]?.content ?? '').toLowerCase();
      const instrTokens = new Set(
        instr.split(/\W+/).filter((t) => t.length >= 3),
      );
      // Match name tokens (word-boundary aware). For names with tokens >= 3 chars,
      // require a token-level match (avoids false positives from common words).
      // For short names (1-2 chars), require an exact substring match so `rewrite
      // Al` remakes the delta for "Al" instead of adding Paco.
      const match = existingDeltas.find((d) => {
        const name = String((d.fields as Record<string, any> | undefined)?.name ?? '').toLowerCase();
        if (name.trim().length === 0) return false;
        const nameTokens = name.split(/\W+/).filter((t) => t.length > 0);
        // If the name has a "long" token (>= 3 chars), require token-level match
        // to avoid false positives from common words like "the", "add", etc.
        const longTokens = nameTokens.filter((t) => t.length >= 3);
        if (longTokens.length > 0) {
          return longTokens.some((t) => instrTokens.has(t));
        }
        // Short name (all tokens < 3 chars): require exact substring match.
        return instr.includes(name);
      });
      if (match) {
        const mergedFields = { ...(match.fields as Record<string, any>) };
        mergedFields.role = mergedFields.role ? `${mergedFields.role}-remade` : 'remade';
        mergedFields.description = `Mock-remade: ${mergedFields.description ?? 'rewritten per instruction'}.`;
        deltas = [GraphDeltaSchema.parse({
          id: crypto.randomUUID(),
          planId,
          nodeType: mockNodeType(match.nodeType) as GraphDelta['nodeType'],
          nodeId: match.nodeId,
          op: 'MODIFY',
          fields: mergedFields,
          createdAt: new Date().toISOString(),
        })];
      } else {
        // A genuinely new proposal must use a fresh identity absent from the
        // plan's existing deltas — otherwise the graph upsert replaces the prior
        // fallback entity instead of adding a distinct new one.
        const usedIds = new Set(existingDeltas.map((d) => d.nodeId));
        let fallbackId = 'vendor_npc';
        while (usedIds.has(fallbackId)) {
          fallbackId = `vendor_npc_${crypto.randomUUID().replace(/-/g, '')}`;
        }
        deltas = [GraphDeltaSchema.parse({
          id: crypto.randomUUID(),
          planId,
          nodeType: 'Character',
          nodeId: fallbackId,
          op: 'ADD',
          fields: {
            name: 'Paco the Vendor',
            description: 'A deterministic mock proposal: add a new character per the free-form instruction.',
            role: 'vendor',
          },
          createdAt: new Date().toISOString(),
        })];
      }
    } else {
      deltas = [GraphDeltaSchema.parse({
        id: crypto.randomUUID(),
        planId,
        nodeType: 'Character',
        nodeId: 'diego',
        op: 'ADD',
        fields: {
          name: 'Diego el Mock',
          description: 'A deterministic mock proposal: add a new character to demonstrate the propose→apply loop.',
          role: 'bartender',
        },
        createdAt: new Date().toISOString(),
      })];
    }
    const last = messages[messages.length - 1]?.content ?? '';
    return {
      reply: `Mock proposal for plan ${planId}: ${deltas.length} delta(s) crafted from "${last}".`,
      deltas,
      deltaEdges: [],
      usage: null,
    };
  }

  async generateFill(prompt: string): Promise<{ fields: Record<string, string>; lore_refs?: string[] }> {
    // Mock provider returns reasonable defaults based on common patterns
    const fields: Record<string, string> = {};

    // Simple heuristic: extract item name from context clues in the prompt
    // In production, the real LLM would generate these properly
    if (prompt.includes('character')) {
      fields['description'] = 'A weathered resident of Las Flores, shaped by the neon-soaked streets and corporate grind of 2077.';
      fields['metadata.personality'] = 'streetwise';
      fields['title'] = 'Resident of Las Flores';
    } else if (prompt.includes('scene')) {
      fields['description'] = 'Rain-slicked streets reflect the kaleidoscope of neon above, casting long shadows between corporate towers.';
      fields['mood'] = 'atmospheric, tense';
    } else if (prompt.includes('location')) {
      fields['description'] = 'A notable landmark in the sprawling cityscape of Las Flores.';
      fields['history'] = 'Built during the first wave of corporate expansion, this location has seen decades of change.';
      fields['daytime'] = 'Bustling with commuters and street vendors.';
      fields['nightlife'] = 'Transformed by neon signs and underground music.';
    } else if (prompt.includes('dialogue')) {
      fields['description'] = 'A conversation that reveals hidden truths about the city.';
    } else if (prompt.includes('mission')) {
      fields['description'] = 'A mission that could change the fate of Las Flores.';
    } else {
      fields['description'] = 'A piece of content in the world of Las Flores 2077.';
    }

    return { fields, lore_refs: [] };
  }

  /**
   * Deterministic templated suggestions — one per item, aligned by index. Shares
   * `templatedSuggestion` with the LiteLLM fallback path so tests and offline runs
   * assert exactly the string a real degraded call would produce.
   */
  async suggestDiagnostics(
    items: IntakeDiagnosticItem[],
  ): Promise<{ suggestions: string[]; usage: LLMUsage | null }> {
    return { suggestions: items.map(templatedSuggestion), usage: null };
  }

}