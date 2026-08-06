import { DialogueNodeVisualSchema } from "@las-flores/shared";
import type { DialogueNodeVisual } from "@las-flores/shared";

// ============================================================
// Dialogue node visual metadata (Visual Novel staging)
//
// Single source of truth for the admin UI's understanding of the
// `DialogueNodeVisualSchema` from @las-flores/shared. Used to render
// per-node visual editors and to construct default values.
//
// The option arrays and the DialogueNodeVisual type are derived from
// the shared schema so the admin editor stays synchronized when the
// schema's enum values change.
// ============================================================

/**
 * Extract the member list of a Zod enum field from the shared schema.
 * The visual fields are declared `.optional()`, so the `ZodOptional`
 * wrapper is unwrapped first; the single source of truth stays the schema.
 */
function zodEnumOptions<V extends string>(field: { unwrap(): unknown }): readonly V[] {
  return (field.unwrap() as { options: readonly V[] }).options;
}

export const VISUAL_MOODS = zodEnumOptions<NonNullable<DialogueNodeVisual["mood"]>>(DialogueNodeVisualSchema.shape.mood);
export const VISUAL_POSITIONS = zodEnumOptions<NonNullable<DialogueNodeVisual["position"]>>(DialogueNodeVisualSchema.shape.position);
export const VISUAL_TRANSITIONS = zodEnumOptions<NonNullable<DialogueNodeVisual["transition"]>>(DialogueNodeVisualSchema.shape.transition);
export type VisualMood = NonNullable<DialogueNodeVisual["mood"]>;
export type VisualPosition = NonNullable<DialogueNodeVisual["position"]>;
export type VisualTransition = NonNullable<DialogueNodeVisual["transition"]>;

/** Common expression tags used across characters' portrait_urls. */
export const EXPRESSION_SUGGESTIONS = [
  "neutral",
  "vulnerable",
  "shocked",
  "calculating",
  "tender",
  "happy",
  "angry",
  "sad",
  "defiant",
] as const;

// Re-export the shared visual type so consumers keep importing it from here.
export type { DialogueNodeVisual };

export const EMPTY_VISUAL: DialogueNodeVisual = {
  expression: undefined,
  background: undefined,
  mood: undefined,
  position: undefined,
  transition: undefined,
  cinematic: undefined,
};

// ============================================================
// Pure helpers (testable without React/DOM)
// ============================================================

/**
 * Immutably set a node's `visual` on a dialogue record's `nodes` map.
 * Builds the record shape `{ nodes: { [nodeId]: { ...visual } } }`.
 */
export function applyNodeVisual(
  record: Record<string, unknown>,
  nodeId: string,
  visual: DialogueNodeVisual | undefined
): Record<string, unknown> {
  const nodes = (record.nodes && typeof record.nodes === "object"
    ? (record.nodes as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const cleanVisual =
    visual && Object.values(visual).some((v) => v !== undefined && v !== "")
      ? visual
      : undefined;

  const target = (nodes[nodeId] && typeof nodes[nodeId] === "object"
    ? {
        ...(nodes[nodeId] as Record<string, unknown>),
        ...(cleanVisual ? { visual: { ...cleanVisual } } : { visual: undefined }),
      }
    : { ...(cleanVisual ? { visual: { ...cleanVisual } } : { visual: undefined }) }) as Record<string, unknown>;

  // Normalize: drop the visual key entirely when empty so the
  // schema validation sees a clean node.
  if (target.visual === undefined) delete target.visual;

  return {
    ...record,
    nodes: {
      ...nodes,
      [nodeId]: target,
    },
  };
}

/** Read a node's visual metadata (or undefined if absent). */
export function getNodeVisual(
  record: Record<string, unknown>,
  nodeId: string
): DialogueNodeVisual | undefined {
  const nodes = (record.nodes && typeof record.nodes === "object"
    ? (record.nodes as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const node = nodes[nodeId] && typeof nodes[nodeId] === "object"
    ? (nodes[nodeId] as Record<string, unknown>)
    : null;
  const visual = node?.visual;
  return visual && typeof visual === "object"
    ? (visual as DialogueNodeVisual)
    : undefined;
}