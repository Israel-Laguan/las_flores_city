import { z } from 'zod';
import { zodUuid } from './uuid.js';
import { CritiqueEvidenceSchema, CritiqueRelatedEntitySchema } from './critique-annotation.js';
import { GraphDeltaSchema, GraphDeltaEdgeSchema } from './graph-delta.js';
import { CritiqueAnnotationSchema } from './critique-annotation.js';

// ---------------------------------------------------------------------------
// M29 — Conversational Chat Assistant + `needs_review` queue
//
// The chat is EPHEMERAL: the server is stateless and the client sends the full
// multi-turn history on every request, so no chat table is introduced. Two
// hand-off shapes are defined here:
//   - `ConflictChatContext` — the §13 "Copy to Chat" bundle (conflict evidence +
//     related entities). It is built SERVER-SIDE from a `CritiqueAnnotation`;
//     the client only ever sends an `annotationId`, never a self-authored bundle,
//     so the prompt context is always canonical.
//   - `ReviewQueueItem`     — one entry in the global `needs_review` triage queue:
//     an open annotation (conflict/suggestion) or a proposed graph delta.
// ---------------------------------------------------------------------------

/** One message in the ephemeral multi-turn chat history. */
export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** Ask/Propose split — questions don't trigger structured generation. */
export const ChatModeSchema = z.enum(['explain', 'propose']);
export type ChatMode = z.infer<typeof ChatModeSchema>;

/**
 * The §13 "Copy to Chat" bundle — the conflict + its evidence + neighborhood
 * peers, carried from a `CritiqueAnnotation`. `detectedAt` is the annotation's
 * `createdAt` (provenance), re-labeled for the chat prompt contract.
 */
export const ConflictChatContextSchema = z.object({
  conflictId: zodUuid(),
  planId: zodUuid(),
  type: z.enum(['conflict', 'suggestion']),
  severity: z.enum(['error', 'warning', 'info']),
  description: z.string().min(1),
  evidence: z.array(CritiqueEvidenceSchema).default([]),
  relatedEntities: z.array(CritiqueRelatedEntitySchema).default([]),
  aiModel: z.string(),
  detectedAt: z.string(),
});
export type ConflictChatContext = z.infer<typeof ConflictChatContextSchema>;

/**
 * One entry in the global `needs_review` queue. `kind` discriminates the entry:
 * a conflict/suggestion (durable `critique_annotations` row, mirrored to the
 * graph) or a proposed graph delta (`:ContentDelta` node / edge).
 */
export const ReviewQueueItemSchema = z.object({
  kind: z.enum(['conflict', 'suggestion', 'delta']),
  planId: zodUuid(),
  planDescription: z.string().optional(),
  annotation: CritiqueAnnotationSchema.optional(),
  delta: GraphDeltaSchema.optional(),
  // Related delta edges authored alongside `delta` (e.g. OWNED_BY / IN_DISTRICT
  // relationships proposed in the same plan). Empty for annotation rows.
  deltaEdges: GraphDeltaEdgeSchema.array().default([]),
});
export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>;