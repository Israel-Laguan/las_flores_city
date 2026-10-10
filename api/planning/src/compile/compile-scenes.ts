// api/planning/src/compile/compile-scenes.ts
// SC-402/403/405: compile planning canon (scenes + overlays) into content-addressed scene
// artifacts and a machine-readable report. DB-free: every dependency is a port.
//
// Per scene: load the scene and its ACTIVE overlays -> `composeScene` (compile mode: static
// overlays folded, flag-gated ones kept as ordered layers, SC-304 conflicts are errors) ->
// check required content through `ContentLookup` (R10) -> snapshot the district weather
// (A6) -> canonical bytes -> sha256 = artifact id.
//
// All-or-nothing: a revision must be a consistent set, so if ANY scene fails, no artifacts
// are returned for any scene (the report still lists every scene's status and issues).
// Nothing here writes: publishing the returned records is the caller's step (SC-406/T2), so
// a failed compile can never leave partial output behind.
//
// Idempotency (SC-403) is structural: the id is the hash of the content only — no timestamp,
// no lookup outcome — so unchanged canon recompiles to identical ids, and `ArtifactStore`
// reports them `unchanged` instead of rewriting.

import {
  COMPILE_ISSUE_CODES,
  buildCompileReport,
  type CompileIssue,
  type CompileReport,
  type CompileSceneEntry,
  type ResolvedScene,
  type SceneArtifactPayload,
  type ValidationIssue,
} from '@las-flores/api-contracts';
import type { SceneDefRepository } from '../canon/scene-def-repository.js';
import type { SceneOverlayRepository } from '../canon/scene-overlay-repository.js';
import { composeScene } from '../scene/compose-scene.js';
import { buildSceneArtifactRecord, type ArtifactRecord } from './artifact-store.js';
import type { ContentLookup, LocationInfo } from './content-lookup.js';

export interface CompileDeps {
  scenes: SceneDefRepository;
  overlays: SceneOverlayRepository;
  content: ContentLookup;
  /** Clock for artifact metadata only (never part of the hash). Default: real time. */
  now?: () => Date;
}

export interface CompileScenesOptions {
  /** Scenes to compile. Default: every active scene. Duplicates are ignored. */
  slugs?: readonly string[];
}

export interface CompileScenesResult {
  report: CompileReport;
  /** One verified record per scene, sorted by scene slug. EMPTY unless `report.ok`. */
  records: ArtifactRecord[];
}

interface Pending {
  slug: string;
  resolved?: ResolvedScene;
  issues: CompileIssue[];
  /** Where each required reference was found, for issue paths. */
  dialogueRefs: Array<{ ref: string; path: string }>;
  casts: Array<{ slug: string; path: string }>;
}

const issueOf = (scene_slug: string, i: ValidationIssue): CompileIssue => ({ ...i, scene_slug });
const own = (scene_slug: string, code: string, path: string, message: string, severity: CompileIssue['severity'] = 'error'): CompileIssue => ({
  code,
  path,
  message,
  severity,
  scene_slug,
});

/** Every dialogue ref and cast the compiled scene mentions, with the path it was found at. */
function references(resolved: ResolvedScene): Pick<Pending, 'dialogueRefs' | 'casts'> {
  const dialogueRefs: Pending['dialogueRefs'] = resolved.base.dialogue_refs.map((ref, i) => ({ ref, path: `dialogue_refs[${i}]` }));
  const casts: Pending['casts'] = [];
  resolved.base.role_slots.forEach((s, i) => {
    if (s.cast !== null) casts.push({ slug: s.cast, path: `role_slots[${i}].cast` });
  });
  for (const layer of resolved.layers) {
    layer.ops.forEach((op, i) => {
      const path = `${layer.slug}.ops[${i}]`;
      if (op.op === 'add_dialogue_refs') op.refs.forEach((ref, j) => dialogueRefs.push({ ref, path: `${path}.refs[${j}]` }));
      else if (op.op === 'add_role_slot' && op.slot.cast !== null) casts.push({ slug: op.slot.cast, path: `${path}.slot.cast` });
      else if (op.op === 'cast_slot' && op.cast !== null) casts.push({ slug: op.cast, path: `${path}.cast` });
    });
  }
  return { dialogueRefs, casts };
}

/**
 * Compiles scenes into artifacts.
 *
 * @param deps - Canon repositories, the content lookup port and an optional clock
 * @param options - Which scenes to compile (default: all active)
 * @returns The report (always) and the artifact records (only when the whole compile is ok)
 */
export async function compileScenes(deps: CompileDeps, options: CompileScenesOptions = {}): Promise<CompileScenesResult> {
  const slugs = [
    ...new Set(options.slugs ?? (await deps.scenes.list()).map((r) => r.slug)),
  ].sort();

  // 1. Load + compose every scene (canon reads only).
  const pending: Pending[] = [];
  for (const slug of slugs) {
    const p: Pending = { slug, issues: [], dialogueRefs: [], casts: [] };
    pending.push(p);
    const record = await deps.scenes.get(slug);
    if (record === undefined) {
      p.issues.push(own(slug, COMPILE_ISSUE_CODES.COMPILE_SCENE_NOT_FOUND, '', `scene '${slug}' does not exist`));
      continue;
    }
    if (record.retiredAt !== null) {
      p.issues.push(own(slug, COMPILE_ISSUE_CODES.COMPILE_SCENE_RETIRED, '', `scene '${slug}' is retired`));
      continue;
    }
    const overlays = (await deps.overlays.listByBase(slug)).map((r) => r.overlay);
    const composed = composeScene(record.scene, overlays);
    p.issues.push(...composed.issues.map((i) => issueOf(slug, i)));
    p.resolved = composed.scene;
    Object.assign(p, references(composed.scene));
  }

  // 2. Required content (R10): one batched lookup per kind across ALL scenes.
  const live = pending.filter((p) => p.resolved !== undefined);
  const locationIds = [...new Set(live.map((p) => p.resolved!.base.location))].sort();
  const locations: ReadonlyMap<string, LocationInfo> = locationIds.length > 0 ? await deps.content.locations(locationIds) : new Map();
  const castSlugs = [...new Set(live.flatMap((p) => p.casts.map((c) => c.slug)))].sort();
  const knownCasts = castSlugs.length > 0 ? await deps.content.characters(castSlugs) : new Set<string>();
  const refSlugs = [...new Set(live.flatMap((p) => p.dialogueRefs.map((r) => r.ref)))].sort();
  const knownDialogues = refSlugs.length > 0 && deps.content.dialogues ? await deps.content.dialogues(refSlugs) : undefined;

  const payloads = new Map<string, SceneArtifactPayload>();
  for (const p of live) {
    const resolved = p.resolved!;
    const location = locations.get(resolved.base.location);
    if (location === undefined) {
      p.issues.push(own(p.slug, COMPILE_ISSUE_CODES.COMPILE_LOCATION_MISSING, 'location', `location '${resolved.base.location}' does not exist`));
    }
    for (const c of p.casts) {
      if (!knownCasts.has(c.slug)) {
        p.issues.push(own(p.slug, COMPILE_ISSUE_CODES.COMPILE_CAST_CHARACTER_MISSING, c.path, `character '${c.slug}' does not exist`));
      }
    }
    if (p.dialogueRefs.length > 0) {
      if (knownDialogues === undefined) {
        p.issues.push(
          own(
            p.slug,
            COMPILE_ISSUE_CODES.COMPILE_DIALOGUE_REFS_UNVERIFIED,
            'dialogue_refs',
            `${p.dialogueRefs.length} dialogue ref(s) were not verified: the content backend cannot resolve dialogue slugs`,
            'hint',
          ),
        );
      } else {
        for (const r of p.dialogueRefs) {
          if (!knownDialogues.has(r.ref)) {
            p.issues.push(own(p.slug, COMPILE_ISSUE_CODES.COMPILE_DIALOGUE_REF_MISSING, r.path, `dialogue '${r.ref}' does not exist`));
          }
        }
      }
    }
    if (location !== undefined) payloads.set(p.slug, { scene: resolved, district_weather: location.districtWeather });
  }

  // 3. Report; build records only if the whole compile is clean.
  const failed = (p: Pending): boolean => p.issues.some((i) => i.severity === 'error');
  const ok = pending.every((p) => !failed(p));
  const createdAt = (deps.now ?? (() => new Date()))().toISOString();
  const records: ArtifactRecord[] = [];
  const entries: CompileSceneEntry[] = pending.map((p) => {
    if (failed(p)) return { scene_slug: p.slug, status: 'failed', artifact_id: null, issues: p.issues };
    const record = buildSceneArtifactRecord(payloads.get(p.slug)!, createdAt);
    if (ok) records.push(record);
    return { scene_slug: p.slug, status: 'compiled', artifact_id: record.artifact.artifact_id, issues: p.issues };
  });

  return { report: buildCompileReport(entries), records };
}
