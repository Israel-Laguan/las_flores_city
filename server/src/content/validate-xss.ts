import type { ValidationError } from './validate.js';

export function sanitizeText(text: string): string {
  const preservedTags: string[] = [];
  let sanitized = text.replace(/<(important|\/important)>/g, (match) => {
    preservedTags.push(match);
    return `__PRESERVED_TAG_${preservedTags.length - 1}__`;
  });

  sanitized = sanitized.replace(/<[^>]*>/g, '');

  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  sanitized = sanitized.replace(/__PRESERVED_TAG_(\d+)__/g, (_, index) => preservedTags[parseInt(index)]);

  return sanitized;
}

export function checkForXSS(content: any): ValidationError[] {
  const errors: ValidationError[] = [];

  function checkValue(value: any, path: string) {
    if (typeof value === 'string') {
      if (/<script/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: script tag detected`,
          severity: 'error',
        });
      }

      if (/on\w+\s*=/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: event handler detected`,
          severity: 'error',
        });
      }

      if (/javascript:/i.test(value)) {
        errors.push({
          message: `Potential XSS in ${path}: javascript: protocol detected`,
          severity: 'error',
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, `${path}.${key}`);
      }
    }
  }

  checkValue(content, 'content');
  return errors;
}
