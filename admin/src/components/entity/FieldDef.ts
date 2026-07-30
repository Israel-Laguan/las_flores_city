type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'boolean'
  | 'badge'
  | 'select'
  | 'array'
  | 'array-of-objects'
  | 'image'
  | 'link'
  | 'kv';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  section?: string;
  readOnly?: boolean;
  badgeVariant?: 'success' | 'warning' | 'info' | 'danger' | 'muted';
  options?: string[];
  placeholder?: string;
  helpText?: string;
  itemFields?: FieldDef[];
  render?: (value: unknown, record: unknown) => React.ReactNode;
}

export function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const segments = path.split('.');
  let current: unknown = obj;
  for (const segment of segments) {
    if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

const PROTECTED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  if (path.split('.').some((segment) => PROTECTED_KEYS.has(segment))) return obj;
  const next = { ...obj };
  const segments = path.split('.');
  let current: Record<string, unknown> = next;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const existing = current[segment];
    current[segment] = existing && typeof existing === 'object' ? (Array.isArray(existing) ? [...(existing as unknown[])] : { ...(existing as Record<string, unknown>) }) : {};
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
  return next;
}
