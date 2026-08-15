import { z } from 'zod';
import { zodUuid } from './uuid.js';

// ---------------------------------------------------------------------------
// M26: AI Critique — `:Conflict` / `:Suggestion` annotation nodes
//
// §13 (AI Semantic Critique): the AI Critique Service queries a neighborhood,
// sends it to an LLM, parses structured JSON, and writes annotation nodes back
// as data the admin can review. Each annotation carries `ai_model` + timestamp
// provenance so switching models/viz never loses prior critique.
//
// M26 deliberately persists these to Postgres (`critique_annotations`) because
// the Neo4j graph substrate arrives later (M27 / M27-b). This schema is THE
// portable node contract: every field maps 1:1 onto a `(:Conflict)` /
// `(:Suggestion)` node and `-[:FLAGGED_IN]->` edges. M27-b migrates rows into
// graph nodes without re-deriving the critique.
// ---------------------------------------------------------------------------

/** One content node implicated by an annotation, with the source text excerpt. */
export const CritiqueEvidenceSchema = z.object({
  nodeType: z.string(),            // 'Character' | 'Dialogue' | 'Mission' | ...
  nodeId: z.string(),              // entity / content id
  // Slug is not guaranteed in model output; default to '' so a missing slug drops
  // only the field, never the whole annotation (which would also discard its
  // description + other evidence).
  slug: z.string().default(''),
  excerpt: z.string(),             // the relevant text snippet (anti-hallucination)
  field: z.string().optional(),    // which field the excerpt came from
});

export type CritiqueEvidence = z.infer<typeof CritiqueEvidenceSchema>;

/** A 1-hop neighborhood peer of the flagged content (for "Copy to Chat"). */
export const CritiqueRelatedEntitySchema = z.object({
  entityType: z.string(),          // 'Character' | 'Scene' | 'Mission' | ...
  slug: z.string(),
  relationship: z.string().optional(),
});

export type CritiqueRelatedEntity = z.infer<typeof CritiqueRelatedEntitySchema>;

/** Which critique pass produced the annotation (maps to the two-model split). */
export const CritiqueScopeSchema = z.enum(['entity', 'cross_entity', 'cross_mission']);
export type CritiqueScope = z.infer<typeof CritiqueScopeSchema>;

/** Lifecycle of an annotation. M26 supports open/dismissed via live overrides;
 *  M29's apply-delta sets 'addressed'. */
export const CritiqueStatusSchema = z.enum(['open', 'addressed', 'dismissed']);
export type CritiqueStatus = z.infer<typeof CritiqueStatusSchema>;

/**
 * A single AI semantic-critique annotation — a `:Conflict` (type='conflict') or
 * `:Suggestion` (type='suggestion') node before it exists in the graph.
 */
export const CritiqueAnnotationSchema = z.object({
  id: zodUuid(),
  type: z.enum(['conflict', 'suggestion']),
  severity: z.enum(['error', 'warning', 'info']),
  description: z.string().min(1),
  evidence: z.array(CritiqueEvidenceSchema).default([]),
  relatedEntities: z.array(CritiqueRelatedEntitySchema).default([]),
  scope: CritiqueScopeSchema.default('entity'),
  aiModel: z.string().min(1),      // provenance
  status: CritiqueStatusSchema.default('open'),
  planId: zodUuid(),
  itemIds: z.array(z.string()).default([]),
  inputHash: z.string().default(''),   // sha256 of serialized subgraph (cache key); empty until the service stamps it
  createdAt: z.string(),           // ISO timestamp
});

export type CritiqueAnnotation = z.infer<typeof CritiqueAnnotationSchema>;

/** Result of one critique run: detected annotations + whether they were cached. */
export const CritiqueAnnotationsResultSchema = z.object({
  annotations: z.array(CritiqueAnnotationSchema).default([]),
  cached: z.boolean().default(false),
  model: z.string().default(''),
});

export type CritiqueAnnotationsResult = z.infer<typeof CritiqueAnnotationsResultSchema>;

/**
 * Input payload to persist an annotation after an AI critique run (before the
 * DB row exists — server assigns the UUID + createdAt).
 */
export const CritiqueAnnotationDraftSchema = CritiqueAnnotationSchema.omit({
  id: true,
  createdAt: true,
  status: true,
});

export type CritiqueAnnotationDraft = z.infer<typeof CritiqueAnnotationDraftSchema>;
