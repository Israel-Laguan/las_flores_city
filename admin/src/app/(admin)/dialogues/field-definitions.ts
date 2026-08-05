import type { FieldDef } from "@/components/entity/FieldDef";

// ============================================================
// Dialogue node visual metadata (Visual Novel staging)
//
// Single source of truth for the admin UI's understanding of the
// `DialogueNodeVisualSchema` from @las-flores/shared. Used to render
// per-node visual editors and to construct default values.
// ============================================================

export const VISUAL_MOODS = ["rain", "tense", "night", "soft_bloom", "alert", "none"] as const;
export type VisualMood = (typeof VISUAL_MOODS)[number];

export const VISUAL_POSITIONS = ["left", "center", "right"] as const;
export type VisualPosition = (typeof VISUAL_POSITIONS)[number];

export const VISUAL_TRANSITIONS = ["fade", "slide", "flash", "none"] as const;
export type VisualTransition = (typeof VISUAL_TRANSITIONS)[number];

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

export interface DialogueNodeVisual {
  expression?: string;
  background?: string;
  mood?: VisualMood;
  position?: VisualPosition;
  transition?: VisualTransition;
  cinematic?: boolean;
}

export const EMPTY_VISUAL: DialogueNodeVisual = {
  expression: undefined,
  background: undefined,
  mood: undefined,
  position: undefined,
  transition: undefined,
  cinematic: undefined,
};

/** FieldDef list for the six visual sub-fields. */
export const DIALOGUE_NODE_VISUAL_FIELDS: FieldDef[] = [
  {
    key: "expression",
    label: "Expression",
    type: "select",
    section: "Visuals",
    options: [...EXPRESSION_SUGGESTIONS],
    helpText: "Portrait variant tag. Must match a portrait_urls[].expression entry.",
  },
  {
    key: "background",
    label: "Background",
    type: "text",
    section: "Visuals",
    placeholder: "scene slug or background URL",
    helpText: "Backdrop behind the dialogue. Leave empty to fall back to the scene.",
  },
  {
    key: "mood",
    label: "Mood",
    type: "select",
    section: "Visuals",
    options: [...VISUAL_MOODS],
  },
  {
    key: "position",
    label: "Position",
    type: "select",
    section: "Visuals",
    options: [...VISUAL_POSITIONS],
  },
  {
    key: "transition",
    label: "Transition",
    type: "select",
    section: "Visuals",
    options: [...VISUAL_TRANSITIONS],
  },
  {
    key: "cinematic",
    label: "Cinematic Mode",
    type: "boolean",
    section: "Visuals",
    helpText: "Hide the bottom bar and center the text full-screen.",
  },
];

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