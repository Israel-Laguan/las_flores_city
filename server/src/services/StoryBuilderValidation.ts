export interface ValidationError {
  file?: string;
  message: string;
  severity: string;
}

export function buildValidationErrors(
  errors: ValidationError[],
  depErrors: string[],
): string[] {
  return [
    ...errors
      .filter(e => e.severity === 'error')
      .map(e => `${e.file ?? ''}: ${e.message}`),
    ...depErrors,
  ];
}
