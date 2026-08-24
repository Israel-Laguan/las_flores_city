// ============================================================
// PlanTemplateBuilders — smallest useful scoped plan templates
//
// Deterministic, schema-valid ContentPlan factories for the two
// scoped authoring shapes (mission, location). These are library
// builders only: they produce a plan for review; nothing here
// writes files or touches canon. Execution always flows through
// StoryBuilderFileWriter → migrateContent → PlanVerificationService
// (see scripts/check-story-builder-writer-guard.mjs).
//
// Restores the M43 "scoped templates" capability retired with the
// pre-graph-db PlanTemplates.ts (PR #109), without reviving the
// direct-YAML wizard path.
// ============================================================
import { randomUUID } from 'node:crypto';
import type { ContentPlan, ContentPlanItem, ContentType } from '@las-flores/shared';
import { ContentPlanSchema } from '@las-flores/shared';

export class UnknownTemplateError extends Error {
  constructor(templateId: string) {
    super(`Unknown plan template "${templateId}". Known templates: ${Object.keys(TEMPLATE_BUILDERS).join(', ')}`);
    this.name = 'UnknownTemplateError';
  }
}

export interface MissionTemplateInput {
  /** Mission title (becomes the mysteries.title canon value). */
  name: string;
  slug: string;
  description?: string;
}

export interface LocationTemplateInput {
  name: string;
  slug: string;
  /** District name — upsertScene resolves/creates the districts row. */
  district: string;
  description?: string;
  history?: string;
  daytime?: string;
  nightlife?: string;
  tags?: string[];
}

const SLUG_RE = /^[a-z0-9_]+$/;

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid slug "${slug}": must contain only lowercase alphanumeric characters and underscores`);
  }
}

function buildItem(type: ContentType, name: string, slug: string, fields: Record<string, any>): ContentPlanItem {
  return {
    id: randomUUID(),
    type,
    action: 'create',
    name,
    slug,
    fields,
    assetNeeds: [],
    dependsOn: [],
  };
}

/** Single mission item → migrates to a `mysteries` row via mission_<slug>.yaml. */
export function buildMissionTemplatePlan(input: MissionTemplateInput): ContentPlan {
  assertSlug(input.slug);
  const item = buildItem('mission', input.name, input.slug, {
    description: input.description || `TODO: Add description for ${input.name}`,
    lore_path: `${input.slug}.md`,
  });
  return finalize({
    id: randomUUID(),
    description: `Mission template: ${input.name}`,
    items: [item],
    links: [],
    status: 'draft',
  });
}

/** Single location item → migrates to a `scenes` row (type=location) via location_<slug>.yaml. */
export function buildLocationTemplatePlan(input: LocationTemplateInput): ContentPlan {
  assertSlug(input.slug);
  const item = buildItem('location', input.name, input.slug, {
    description: input.description || `TODO: Add description for ${input.name}`,
    district: input.district,
    history: input.history || `TODO: Add history for ${input.name}`,
    daytime: input.daytime || `TODO: Add daytime description`,
    nightlife: input.nightlife || `TODO: Add nightlife description`,
    tags: input.tags || [],
    important_places: [],
    lore_path: `${input.slug}.md`,
  });
  return finalize({
    id: randomUUID(),
    description: `Location template: ${input.name} (${input.district})`,
    items: [item],
    links: [],
    status: 'draft',
  });
}

function finalize(plan: ContentPlan): ContentPlan {
  // Template plans are safe to re-stage: the template_replay marker lets
  // stagePlan overwrite this plan's own target files in place (migrateContent
  // then checksum-skips unchanged rows). Invalid input must still fail here,
  // never downstream at migration time.
  return ContentPlanSchema.parse({
    ...plan,
    _meta: { ...plan._meta, template_replay: true },
  });
}

type TemplateBuilder = (params: Record<string, any>) => ContentPlan;

/**
 * Registry of scoped templates. Every entry produces a plan that is safe to
 * re-run: re-executing the same plan overwrites its own files in place and
 * migrateContent checksum-skips unchanged rows.
 */
export const TEMPLATE_BUILDERS: Record<string, TemplateBuilder> = {
  mission: (params) => buildMissionTemplatePlan(params as MissionTemplateInput),
  location: (params) => buildLocationTemplatePlan(params as LocationTemplateInput),
};

export function listPlanTemplates(): Array<{ id: string }> {
  return Object.keys(TEMPLATE_BUILDERS).map((id) => ({ id }));
}

/** Build a plan from a registered template. Throws UnknownTemplateError on an unknown id. */
export function buildPlanFromTemplate(
  templateId: string,
  params: Record<string, any>,
): ContentPlan {
  const builder = TEMPLATE_BUILDERS[templateId];
  if (!builder) throw new UnknownTemplateError(templateId);
  return builder(params ?? {});
}
