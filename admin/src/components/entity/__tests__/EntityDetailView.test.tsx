import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EntityDetailView from '../EntityDetailView';
import type { FieldDef } from '../FieldDef';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'role', label: 'Role', type: 'badge', badgeVariant: 'success' },
  { key: 'scores', label: 'Scores', type: 'array' },
  { key: 'friends', label: 'Friends', type: 'array-of-objects', itemFields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'closeness', label: 'Closeness', type: 'number' },
  ]},
  { key: 'notes', label: 'Notes', type: 'text' },
  { key: 'photo', label: 'Photo', type: 'image' },
  { key: 'website', label: 'Site', type: 'link' },
  { key: 'metadata', label: 'Metadata', type: 'kv' },
];

const RECORD = {
  name: 'Alice',
  role: 'detective',
  scores: [1, 2, 3],
  friends: [{ name: 'Bob', closeness: 80 }],
  notes: '...',
  photo: 'https://cdn.test/a.png',
  website: 'https://example.com',
  metadata: { city: 'NYC', active: true },
};

describe('EntityDetailView', () => {
  it('renders plain fields, badges, arrays, image, link, and kv', () => {
    render(<EntityDetailView record={RECORD} fields={FIELDS} title="Detail" />);
    expect(screen.getByText('Detail')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('detective')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('80')).toBeDefined();
    expect(screen.getByText('NYC')).toBeDefined();
    expect(screen.getByText('true')).toBeDefined();
    const link = screen.getByText('https://example.com');
    expect((link as HTMLAnchorElement).href).toBe('https://example.com/');
    const img = screen.getByRole('img', { name: 'Photo' }) as HTMLImageElement;
    expect(img.src).toBe('https://cdn.test/a.png');
  });
});
