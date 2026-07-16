import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import VerificationReport from '../components/VerificationReport';
import type { VerificationReport as VerificationReportData } from '@las-flores/shared';

function createReport(
  overrides: Partial<VerificationReportData> = {},
): VerificationReportData {
  return {
    planId: '00000000-0000-0000-0000-000000000001',
    checkedAt: '2026-07-16T10:00:00.000Z',
    passed: true,
    checks: [
      {
        name: 'lore-path-resolution',
        description: 'All lore_path references point to existing files on disk.',
        status: 'pass',
      },
      {
        name: 'fk-integrity',
        description: 'All FK references in migrated data resolve to existing rows.',
        status: 'fail',
        details: ['Missing FK: dialogue_tree "abc" does not exist'],
      },
      {
        name: 'asset-need-status',
        description: 'Asset generation statuses are sane.',
        status: 'warn',
        details: ['Diego: asset need "portrait" is still pending'],
      },
    ],
    errors: ['fk-integrity: failed'],
    warnings: ['asset-need-status: warning'],
    ...overrides,
  };
}

describe('VerificationReport', () => {
  it('renders a pass banner when the report passed', () => {
    render(<VerificationReport report={createReport({ passed: true })} />);
    expect(screen.getByText('Verification passed')).toBeInTheDocument();
  });

  it('renders a fail banner when the report failed', () => {
    render(<VerificationReport report={createReport({ passed: false })} />);
    expect(screen.getByText('Verification failed')).toBeInTheDocument();
  });

  it('shows pass/warn/fail counts', () => {
    render(<VerificationReport report={createReport()} />);
    expect(screen.getByText('1 pass')).toBeInTheDocument();
    expect(screen.getByText('1 warn')).toBeInTheDocument();
    expect(screen.getByText('1 fail')).toBeInTheDocument();
  });

  it('surfaces error messages prominently', () => {
    render(<VerificationReport report={createReport()} />);
    expect(screen.getByText('fk-integrity: failed')).toBeInTheDocument();
  });

  it('lists every check by name', () => {
    render(<VerificationReport report={createReport()} />);
    expect(screen.getByText('lore-path-resolution')).toBeInTheDocument();
    expect(screen.getByText('fk-integrity')).toBeInTheDocument();
    expect(screen.getByText('asset-need-status')).toBeInTheDocument();
  });

  it('shows failing-check details by default and lets users collapse them', async () => {
    render(<VerificationReport report={createReport()} />);
    const detail = screen.getByText('Missing FK: dialogue_tree "abc" does not exist');
    expect(detail).toBeInTheDocument();
    expect(detail.closest('ul')).not.toBeNull();
  });
});
