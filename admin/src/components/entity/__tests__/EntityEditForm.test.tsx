import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntityEditForm from '../EntityEditForm';
import type { FieldDef } from '../FieldDef';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'active', label: 'Active', type: 'boolean' },
  { key: 'role', label: 'Role', type: 'select', options: ['hero', 'villain'] },
  { key: 'tags', label: 'Tags', type: 'array' },
  { key: 'skills', label: 'Skills', type: 'array-of-objects', itemFields: [
    { key: 'name', label: 'Skill', type: 'text' },
    { key: 'level', label: 'Level', type: 'number' },
  ]},
  { key: 'metadata', label: 'Metadata', type: 'kv' },
];

const INITIAL = {
  name: 'Alice',
  description: 'desc',
  age: 30,
  active: true,
  role: 'hero',
  tags: ['x'],
  skills: [{ name: 'run', level: 5 }],
  metadata: { a: '1' },
};

describe('EntityEditForm', () => {
  it('calls onChange with setByPath-shaped updates and onSubmit', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    const { container } = render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);

    const nameInput = container.querySelector('input[value="Alice"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Eve' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Eve' }));

    const desc = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: 'new desc' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'new desc' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
