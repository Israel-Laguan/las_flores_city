'use client';

import React from 'react';
import { cn } from '@las-flores/ui';
import Badge from '@/components/Badge';
import { FieldDef, getByPath } from './FieldDef';
import styles from './EntityDetailView.module.css';

interface Props {
  record: unknown;
  fields: FieldDef[];
  title?: string;
}

function renderValue(field: FieldDef, value: unknown, record: unknown) {
  if (field.render) return field.render(value, record);
  if (value === undefined || value === null || value === '') return <span className={styles.muted}>—</span>;

  switch (field.type) {
    case 'link': {
      const str = String(value);
      return str.startsWith('http') ? (
        <a href={str} target="_blank" rel="noreferrer">{str}</a>
      ) : (
        <span>{str}</span>
      );
    }
    case 'image': {
      const str = String(value);
      return str ? (
        <img
          src={str}
          alt={field.label}
          className={styles.image}
          onError={(e) => { (e.currentTarget.style.display = 'none'); }}
        />
      ) : (
        <span className={styles.muted}>—</span>
      );
    }
    case 'badge':
    case 'select':
      return <Badge variant={field.badgeVariant || 'info'}>{String(value)}</Badge>;
    case 'boolean':
      return <Badge variant={value ? 'success' : 'warning'}>{value ? 'Yes' : 'No'}</Badge>;
    case 'array':
      if (!Array.isArray(value) || value.length === 0) return <span className={styles.muted}>—</span>;
      return (
        <ul className={styles.array}>
          {value.map((item, idx) => (
            <li key={idx} className="badge badge--info">
              {String(item)}
            </li>
          ))}
        </ul>
      );
    case 'array-of-objects':
      if (!Array.isArray(value) || value.length === 0) return <span className={styles.muted}>—</span>;
      const itemFields = field.itemFields || [];
      return (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {itemFields.map((sub) => (
                  <th key={sub.key} className="table__th">{sub.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((item, rowIdx) => (
                <tr key={rowIdx}>
                  {itemFields.map((sub) => (
                    <td key={sub.key} className="table__td">
                      {renderValue(sub, getByPath(item, sub.key), item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'kv': {
      const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
      if (!data || Object.keys(data).length === 0) return <span className={styles.muted}>—</span>;
      return (
        <table className={styles.kvTable}>
          <tbody>
            {Object.entries(data).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className={styles.mono}>{v === null || v === undefined ? 'null' : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    default:
      return <span className={styles.mono}>{String(value)}</span>;
  }
}

export default function EntityDetailView({ record, fields, title }: Props) {
  const sections = Array.from(new Set(fields.map((f) => f.section || '__root__')));
  return (
    <main className={styles.main}>
      {title && <h1>{title}</h1>}
      {sections.map((section) => {
        const sectionFields = section === '__root__' ? fields : fields.filter((f) => f.section === section);
        return (
          <React.Fragment key={section || '__root__'}>
            {section !== '__root__' && <div className={styles.sectionHeading}>{section}</div>}
            <div className={styles.grid}>
              {sectionFields.map((field) => {
                const value = getByPath(record, field.key);
                return (
                  <div key={field.key} className={cn(styles.field, field.readOnly && styles.readOnly)}>
                    <span className={styles.label}>{field.label}</span>
                    {renderValue(field, value, record)}
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}
    </main>
  );
}
