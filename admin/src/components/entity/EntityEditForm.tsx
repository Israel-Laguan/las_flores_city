'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@las-flores/ui';
import { FieldDef, getByPath, setByPath } from './FieldDef';
import styles from './EntityEditForm.module.css';

interface Props {
  yaml: Record<string, unknown>;
  fields: FieldDef[];
  submitting?: boolean;
  onChange: (yaml: Record<string, unknown>) => void;
  onSubmit: () => void;
}

function Control({ field, value, onChange }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  if (field.readOnly) {
    return (
      <input
        readOnly
        disabled
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        className="input"
      />
    );
  }

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className="textarea"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value || 0);
      return (
        <input
          type="number"
          className="input"
          value={Number.isFinite(num) ? num : ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
    }
    case 'boolean':
      return (
        <select
          className="select"
          value={typeof value === 'boolean' ? (value ? 'true' : 'false') : 'false'}
          onChange={(e) => onChange(e.target.value === 'true')}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    case 'select': {
      const options = field.options || [];
      return (
        <select className="select" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    case 'array': {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div>
          <div className={styles.array}>
            {arr.map((item, idx) => (
              <span key={idx} className={styles.tag}>
                {String(item)}
                <button type="button" className={styles.tagRemove} onClick={() => onChange(arr.filter((_, i) => i !== idx))}>×</button>
              </span>
            ))}
          </div>
          <input
            className="input"
            placeholder="Add item"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const target = e.target as HTMLInputElement;
                const v = target.value.trim();
                if (v && !arr.includes(v)) {
                  onChange([...arr, v]);
                  target.value = '';
                }
              }
            }}
          />
        </div>
      );
    }
    case 'array-of-objects': {
      const list = Array.isArray(value) ? value : [];
      const subFields = field.itemFields || [];
      return (
        <div>
          <div className={styles.tableWrap}>
            <table className="table">
              <thead>
                <tr>
                  {subFields.map((sf) => (
                    <th key={sf.key} className="table__th">{sf.label}</th>
                  ))}
                  <th className="table__th" style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {list.map((item, idx) => (
                  <tr key={idx}>
                    {subFields.map((sf) => {
                      const val = getByPath(item, sf.key);
                      return (
                        <td key={sf.key} className="table__td">
                          <input
                            className="input"
                            value={typeof val === 'string' || typeof val === 'number' ? val : ''}
                            onChange={(e) => {
                              const nextItem = setByPath({ ...(item as Record<string, unknown>) }, sf.key, e.target.value);
                              onChange(list.map((v, i) => (i === idx ? nextItem : v)));
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="table__td">
                      <button
                        type="button"
                        className="btn btn--danger btn--small"
                        onClick={() => onChange(list.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className={cn('btn btn--secondary btn--small', styles.addButton)}
            onClick={() => {
              const empty: Record<string, string> = {};
              for (const sf of subFields) empty[sf.key] = '';
              onChange([...list, empty]);
            }}
          >
            Add row
          </button>
        </div>
      );
    }
    case 'kv': {
      const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      const entries = Object.entries(data);
      return (
        <div>
          <table className={styles.kvTable}>
            <tbody>
              {entries.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ width: '40%' }}>
                    <input
                      className="input"
                      value={k}
                      onChange={(e) => {
                        const next: Record<string, unknown> = {};
                        for (const [ek, ev] of Object.entries(data)) {
                          if (ek !== k) next[ek] = ev;
                        }
                        next[e.target.value] = v;
                        onChange(next);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={v === null || v === undefined ? '' : String(v)}
                      onChange={(e) => {
                        const next = { ...data, [k]: e.target.value };
                        onChange(next);
                      }}
                    />
                  </td>
                  <td style={{ width: 70 }}>
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      onClick={() => {
                        const next = { ...data };
                        delete next[k];
                        onChange(next);
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className={cn('btn btn--secondary btn--small', styles.addButton)}
            onClick={() => onChange({ ...data, '': '' })}
          >
            Add entry
          </button>
        </div>
      );
    }
    case 'image':
    case 'text':
    case 'date':
    default:
      return (
        <input
          className="input"
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
}

export default function EntityEditForm({ yaml, fields, submitting, onChange, onSubmit }: Props) {
  const sections = Array.from(new Set(fields.map((f) => f.section || '__root__')));
  const [dirty, setDirty] = useState(false);

  const handleChange = useCallback(
    (fieldKey: string, value: unknown) => {
      const next = setByPath(yaml, fieldKey, value);
      onChange(next);
      setDirty(true);
    },
    [onChange, yaml],
  );

  return (
    <div>
      {sections.map((section) => {
        const sectionFields = section === '__root__' ? fields : fields.filter((f) => f.section === section);
        return (
          <React.Fragment key={section || '__root__'}>
            {section !== '__root__' && <div className={styles.sectionHeading}>{section}</div>}
            <div className={styles.grid}>
              {sectionFields.map((field) => {
                const value = getByPath(yaml, field.key);
                return (
                  <div key={field.key} className={styles.field}>
                    {field.type !== 'kv' && <label className={styles.label}>{field.label}</label>}
                    <Control field={field} value={value} onChange={(v) => handleChange(field.key, v)} />
                    {field.helpText && <span className={styles.helpText}>{field.helpText}</span>}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}

      <div className={styles.actions}>
        <button type="button" onClick={onSubmit} disabled={submitting} className={cn('btn btn--primary', dirty ? '' : 'btn--disabled')}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
