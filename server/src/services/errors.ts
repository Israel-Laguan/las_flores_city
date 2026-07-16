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
