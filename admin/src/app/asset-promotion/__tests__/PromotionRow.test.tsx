import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PromotionRow from '../components/PromotionRow';

const noop = vi.fn();

function createStatus(overrides: Record<string, any> = {}) {
  return {
    contentPath: 'characters/diego',
    name: 'Diego',
    stages: {},
    ...overrides,
  };
}

describe('PromotionRow', () => {
  it('renders the entity name', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus()}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('Diego')).toBeInTheDocument();
  });

  it('shows dev badge when dev stage exists', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' } } })}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('dev')).toBeInTheDocument();
  });

  it('shows staging badge when staging stage exists', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' } } })}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('staging')).toBeInTheDocument();
  });

  it('shows production badge when production stage exists', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' }, production: { url: 'http://prod' } } })}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('production')).toBeInTheDocument();
  });

  it('shows Promote to Staging when dev exists but staging does not', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' } } })}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('Promote to Staging')).toBeInTheDocument();
  });

  it('shows Promote to Production when staging exists but production does not', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' } } })}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('Promote to Production')).toBeInTheDocument();
  });

  it('shows Rollback when staging exists', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' }, staging: { url: 'http://staging' } } })}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('Rollback')).toBeInTheDocument();
  });

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

  it('shows dashes when no stages exist', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus()}
          entityType="Character"
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('disables buttons when disabled prop is true', () => {
    render(
      <table><tbody>
        <PromotionRow
          status={createStatus({ stages: { dev: { url: 'http://dev' } } })}
          entityType="Character"
          disabled={true}
          onPromoteStaging={noop}
          onPromoteProduction={noop}
          onRollbackStaging={noop}
        />
      </tbody></table>
    );
    expect(screen.getByText('Promote to Staging')).toBeDisabled();
  });
});
