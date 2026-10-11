// api/contracts/src/artifact/compile-report.ts
// SC-405: the machine-readable result of a compile. Same issue format as every validator
// (`ValidationIssue`), plus the scene each issue belongs to. Stable JSON: scenes sorted by
// slug, issues in discovery order, keys sorted — two compiles of the same input produce
// byte-identical reports.

import type { ValidationIssue } from '../validation/issue.js';

export const COMPILE_REPORT_VERSION = 1 as const;

/** Codes the compile step itself adds (composition/validation codes pass through unchanged). */
export const COMPILE_ISSUE_CODES = {
  /** The scene slug has no row in `planning.scene_defs`. */
  COMPILE_SCENE_NOT_FOUND: 'COMPILE_SCENE_NOT_FOUND',
  /** The scene is retired and cannot be compiled. */
  COMPILE_SCENE_RETIRED: 'COMPILE_SCENE_RETIRED',
  /** `scene.location` names no legacy location row (R10: required content). */
  COMPILE_LOCATION_MISSING: 'COMPILE_LOCATION_MISSING',
  /** A `dialogue_refs` slug (base or overlay) resolves to no dialogue. */
  COMPILE_DIALOGUE_REF_MISSING: 'COMPILE_DIALOGUE_REF_MISSING',
  /** A role-slot cast (base or overlay) names no character. */
  COMPILE_CAST_CHARACTER_MISSING: 'COMPILE_CAST_CHARACTER_MISSING',
  /**
   * `hint`: the content backend cannot resolve dialogue slugs (legacy `dialogue_trees` has
   * no slug), so the refs were NOT verified. Reported, never silently skipped.
   */
  COMPILE_DIALOGUE_REFS_UNVERIFIED: 'COMPILE_DIALOGUE_REFS_UNVERIFIED',
} as const;

export type CompileIssueCode = (typeof COMPILE_ISSUE_CODES)[keyof typeof COMPILE_ISSUE_CODES];

export interface CompileIssue extends ValidationIssue {
  scene_slug: string;
}

export type CompileSceneStatus = 'compiled' | 'failed';

export interface CompileSceneEntry {
  scene_slug: string;
  status: CompileSceneStatus;
  /** Set when `compiled`, `null` when `failed`. */
  artifact_id: string | null;
  issues: CompileIssue[];
}

export interface CompileReport {
  report_version: typeof COMPILE_REPORT_VERSION;
  /** True only when every scene compiled. A single failed scene fails the whole compile. */
  ok: boolean;
  scenes: CompileSceneEntry[];
  error_count: number;
  warning_count: number;
  hint_count: number;
}

const bySlug = (a: CompileSceneEntry, b: CompileSceneEntry): number =>
  a.scene_slug < b.scene_slug ? -1 : a.scene_slug > b.scene_slug ? 1 : 0;

/** Builds a report from per-scene entries (sorted by slug; counts derived, never trusted). */
export function buildCompileReport(entries: ReadonlyArray<CompileSceneEntry>): CompileReport {
  const scenes = [...entries].sort(bySlug);
  const all = scenes.flatMap((s) => s.issues);
  return {
    report_version: COMPILE_REPORT_VERSION,
    ok: scenes.every((s) => s.status === 'compiled'),
    scenes,
    error_count: all.filter((i) => i.severity === 'error').length,
    warning_count: all.filter((i) => i.severity === 'warning').length,
    hint_count: all.filter((i) => i.severity === 'hint').length,
  };
}

/** Sorted-key JSON text of a report, suitable for CI output and diffing. */
export function stringifyCompileReport(report: CompileReport): string {
  const issue = (i: CompileIssue) => ({ code: i.code, message: i.message, path: i.path, scene_slug: i.scene_slug, severity: i.severity });
  return JSON.stringify({
    error_count: report.error_count,
    hint_count: report.hint_count,
    ok: report.ok,
    report_version: report.report_version,
    scenes: report.scenes.map((s) => ({ artifact_id: s.artifact_id, issues: s.issues.map(issue), scene_slug: s.scene_slug, status: s.status })),
    warning_count: report.warning_count,
  });
}
