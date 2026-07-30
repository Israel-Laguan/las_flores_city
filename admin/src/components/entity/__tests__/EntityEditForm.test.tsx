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
    render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);

    const nameInput = screen.getByDisplayValue('Alice') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Eve' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Eve' }));

    const desc = screen.getByDisplayValue('desc') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: 'new desc' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'new desc' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('handles number field type', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);
    const ageInput = screen.getByDisplayValue('30') as HTMLInputElement;
    fireEvent.change(ageInput, { target: { value: '25' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ age: 25 }));
  });

  it('handles boolean field type', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);
    // The boolean control renders a <select> with Yes/No options; for a
    // <select>, getByDisplayValue matches the selected option's text content.
    const activeSelect = screen.getByDisplayValue('Yes') as HTMLSelectElement;
    fireEvent.change(activeSelect, { target: { value: 'false' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ active: false }));
  });

  it('handles select field type', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);
    const roleSelect = screen.getByDisplayValue('hero') as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'villain' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'villain' }));
  });

  it('handles array field type — adds a new tag', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);
    const tagsInput = screen.getByPlaceholderText('Add item') as HTMLInputElement;
    fireEvent.change(tagsInput, { target: { value: 'newtag' } });
    fireEvent.keyDown(tagsInput, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ tags: expect.arrayContaining(['x', 'newtag']) }));
  });

  it('handles array-of-objects field type — edits a sub-field', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);
    const skillNameInput = screen.getByDisplayValue('run') as HTMLInputElement;
    fireEvent.change(skillNameInput, { target: { value: 'jump' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      skills: expect.arrayContaining([expect.objectContaining({ name: 'jump' })]),
    }));
  });

  it('handles kv field type — edits a key', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(<EntityEditForm yaml={INITIAL as any} fields={FIELDS} onChange={onChange} onSubmit={onSubmit} />);
    const kvKeyInput = screen.getByDisplayValue('a') as HTMLInputElement;
    fireEvent.change(kvKeyInput, { target: { value: 'b' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ b: '1' }),
    }));
  });
});
