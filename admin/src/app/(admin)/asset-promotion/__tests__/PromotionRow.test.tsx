import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PromotionRow from '../components/PromotionRow';

const noop = vi.fn();

interface PromotionStatus {
  contentPath: string;
  name: string;
  stages: {
    dev?: { url: string };
    staging?: { url: string };
    production?: { url: string };
  };
}

function createStatus(overrides: Partial<PromotionStatus> = {}): PromotionStatus {
  return {
    contentPath: 'characters/diego',
    name: 'Diego',
    stages: {},
    ...overrides,
  };
}

describe('PromotionRow', () => {
  const renderRow = (overrides: Record<string, any> = {}, extraProps: Record<string, any> = {}) => {
    return render(
      <table><tbody>
        <PromotionRow
          status={createStatus(overrides)}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
          {...extraProps}
        />
      </tbody></table>
    );
  };

  it('renders the entity name', () => {
    renderRow();
    expect(screen.getByText('Diego')).toBeInTheDocument();
  });

  it('shows dev badge when dev stage exists', () => {
    renderRow({ stages: { dev: { url: 'http://dev' } } });
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('shows staging badge when staging stage exists', () => {
    renderRow({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' } } });
    expect(screen.getByText('staging')).toBeInTheDocument();
  });

  it('shows production badge when production stage exists', () => {
    renderRow({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' }, production: { url: 'http://prod' } } });
    expect(screen.getByText('production')).toBeInTheDocument();
  });
});

describe('PromotionRow - promotion button visibility', () => {
  const renderRow = (overrides: Record<string, any> = {}) => {
    return render(
      <table><tbody>
        <PromotionRow
          status={createStatus(overrides)}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
  };

  it('shows Promote to Staging when dev exists but staging does not', () => {
    renderRow({ stages: { dev: { url: 'http://dev' } } });
    expect(screen.getByText('Promote to Staging')).toBeInTheDocument();
  });

  it('shows Promote to Production when staging exists but production does not', () => {
    renderRow({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' } } });
    expect(screen.getByText('Promote to Production')).toBeInTheDocument();
  });

  it('shows Rollback when staging exists', () => {
    renderRow({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' } } });
    expect(screen.getByText('Rollback')).toBeInTheDocument();
  });
});

describe('PromotionRow - interaction', () => {
  it('calls onPromoteStaging when button is clicked', async () => {
    const user = userEvent.setup();
    const onPromoteStaging = vi.fn();
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' } } })}
          entityType="Character"
          onPromoteStaging={onPromoteStaging}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    await user.click(screen.getByText('Promote to Staging'));
    expect(onPromoteStaging).toHaveBeenCalledWith('characters/diego');
  });
});

describe('PromotionRow - edge cases', () => {
  const renderRow = (overrides: Record<string, any> = {}, extraProps: Record<string, any> = {}) => {
    return render(
      <table><tbody>
        <PromotionRow
          status={createStatus(overrides)}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
          {...extraProps}
        />
      </tbody></table>
    );
  };

  it('shows dashes when no stages exist', () => {
    renderRow();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('disables buttons when disabled prop is true', () => {
    renderRow({ stages: { dev: { url: 'http://dev' } } }, { disabled: true });
    expect(screen.getByText('Promote to Staging')).toBeDisabled();
  });
});
