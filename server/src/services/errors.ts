/**
 * Typed error classes for the story builder services.
 * These allow route handlers to distinguish error types without string matching.
 */

export class PlanNotFoundError extends Error {
  readonly isPlanNotFound = true;
  constructor(planId: string) {
    super(`Plan not found: ${planId}`);
    this.name = 'PlanNotFoundError';
  }
}

export class PlanStatusError extends Error {
  readonly isPlanStatusError = true;
  constructor(message: string) {
    super(message);
    this.name = 'PlanStatusError';
  }
}

export function isPlanNotFoundError(err: unknown): err is PlanNotFoundError {
  return err instanceof PlanNotFoundError;
}

export function isPlanStatusError(err: unknown): err is PlanStatusError {
  return err instanceof PlanStatusError;
}

export class PatchNotFoundError extends Error {
  readonly isPatchNotFound = true;
  constructor(patchId: string) {
    super(`Patch not found: ${patchId}`);
    this.name = 'PatchNotFoundError';
  }
}

export class PatchStatusError extends Error {
  readonly isPatchStatus = true;
  constructor(message: string) {
    super(message);
    this.name = 'PatchStatusError';
  }
}

export class ClaimNotFoundError extends Error {
  readonly isClaimNotFound = true;
  constructor(claimId: string) {
    super(`Claim not found: ${claimId}`);
    this.name = 'ClaimNotFoundError';
  }
}

export class ClaimTransitionError extends Error {
  readonly isClaimTransition = true;
  constructor(message: string) {
    super(message);
    this.name = 'ClaimTransitionError';
  }
}
