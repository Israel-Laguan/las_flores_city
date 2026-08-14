/**
 * Tests for ConflictScopeReport.tsx
 * Milestone 25: bounded conflict report + recorded "checked scope".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConflictScopeReport, { type ConflictScopeReportData } from '../components/ConflictScopeReport';
import type { CheckedScope, BoundedConflict } from '@las-flores/shared';

const cb = '2026-01-01T00:00:00.000Z';

function scope(overrides: Partial<CheckedScope> = {}): CheckedScope {
  return {
    entityType: 'character',
    rule: 'location_conflict',
    scopeDescriptor: 'scenes in plan (1)',
    entityIdsChecked: ['a1930000-1111-4111-8111-111111111111'],
    checkedAt: cb,
    ...overrides,
  };
}

function finding(overrides: Partial<BoundedConflict> = {}): BoundedConflict {
  return {
    rule: 'location_conflict',
    severity: 'warning',
    description: 'Character "Marcus" home differs.',
    entityRefs: [],
    itemIds: [],
    hitByCheckedScope: true,
    ...overrides,
  };
}

describe('ConflictScopeReport', () => {
  it('renders nothing when there is no report', () => {
    const { container } = render(<ConflictScopeReport report={null} planId="p1" />);
    expect(container.querySelector('[data-testid="conflict-scope-report"]')).toBeNull();
  });

  it('renders a clean state with no findings and records the checked scope', () => {
    const report: ConflictScopeReportData = {
      checkedScope: [scope()],
      findings: [],
      passed: true,
      createdAt: cb,
    };
    render(<ConflictScopeReport report={report} planId="p1" />);
    expect(screen.getByText(/no blocking conflicts/)).toBeInTheDocument();
    expect(screen.getByText(/No bounded conflicts in this neighborhood/)).toBeInTheDocument();
  });

  it('renders findings and the checked scope honestly', () => {
    const report: ConflictScopeReportData = {
      checkedScope: [scope()],
      findings: [finding()],
      passed: false,
      createdAt: cb,
    };
    render(<ConflictScopeReport report={report} planId="p1" />);
    expect(screen.getByText(/conflicts found/)).toBeInTheDocument();
    expect(screen.getAllByText(/Location/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Character "Marcus" home differs/)).toBeInTheDocument();
    expect(screen.getByText('Checked scope')).toBeInTheDocument();
    expect(screen.getByText('1 entities checked')).toBeInTheDocument();
  });
});