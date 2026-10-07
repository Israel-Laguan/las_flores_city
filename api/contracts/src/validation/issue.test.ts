// api/contracts/src/validation/issue.test.ts
import { createValidationResult, issuePath, type ValidationIssue } from './issue.js';

const issue = (severity: ValidationIssue['severity']): ValidationIssue => ({
  code: 'X',
  path: 'a',
  message: 'm',
  severity,
});

describe('validation issue format', () => {
  test('result is valid when there are no error-severity issues', () => {
    expect(createValidationResult([]).valid).toBe(true);
    expect(createValidationResult([issue('warning'), issue('hint')]).valid).toBe(true);
    expect(createValidationResult([issue('warning'), issue('error')]).valid).toBe(false);
  });

  test('result keeps issues in the order given', () => {
    const issues = [issue('error'), issue('hint')];
    expect(createValidationResult(issues).issues).toEqual(issues);
  });

  test('issuePath joins keys with dots and indices with brackets', () => {
    expect(issuePath()).toBe('');
    expect(issuePath('role_slots', 1, 'cast')).toBe('role_slots[1].cast');
    expect(issuePath('items', 0)).toBe('items[0]');
  });
});
