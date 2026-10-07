// api/contracts/src/validation/issue.ts
// SC-301b: the structured validation-issue format. Fixed now because composition
// conflicts (E3) and later checks (SC-603/SC-405) reuse it: validators return issues,
// they do not throw strings.

export const ISSUE_SEVERITIES = ['error', 'warning', 'hint'] as const;
/**
 * - `error`   — the input is invalid; fails validation / compile.
 * - `warning` — suspicious but valid; surfaced, never blocks.
 * - `hint`    — advisory only (e.g. a conservative check that could not decide).
 */
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export interface ValidationIssue<Code extends string = string> {
  /** Stable machine-readable constant, e.g. `SCENE_SLUG_INVALID`. */
  code: Code;
  /** Location in the input: `role_slots[1].slot_id`; `''` = the root value. */
  path: string;
  /** Human-readable explanation. Not stable — match on `code`, never on this. */
  message: string;
  severity: IssueSeverity;
}

export interface ValidationResult<Code extends string = string> {
  /** True when no issue has `error` severity (warnings/hints do not invalidate). */
  valid: boolean;
  /** Every issue found, in discovery order. */
  issues: ValidationIssue<Code>[];
}

export function createValidationResult<Code extends string>(
  issues: ValidationIssue<Code>[],
): ValidationResult<Code> {
  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}

/** Builds an issue path: strings join with dots, numbers become `[n]`. */
export function issuePath(...parts: ReadonlyArray<string | number>): string {
  let out = '';
  for (const part of parts) {
    out += typeof part === 'number' ? `[${part}]` : out === '' ? part : `.${part}`;
  }
  return out;
}
