import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Stepper from '../components/Stepper';

const testSteps = [
  { order: 0, label: 'Edit', description: 'Create content' },
  { order: 1, label: 'Validate', description: 'Validate YAML' },
  { order: 2, label: 'Migrate', description: 'Migrate to DB' },
];

describe('Stepper', () => {
  it('renders all step labels', () => {
    render(<Stepper steps={testSteps} currentStep={0} />);
    for (const step of testSteps) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it('marks current step with aria-current="step"', () => {
    const { rerender } = render(<Stepper steps={testSteps} currentStep={0} />);
    expect(screen.getByText('1')).toHaveAttribute('aria-current', 'step');

    rerender(<Stepper steps={testSteps} currentStep={1} />);
    expect(screen.getByText('2')).toHaveAttribute('aria-current', 'step');
  });

  it('shows checkmark for done steps', () => {
    render(<Stepper steps={testSteps} currentStep={1} />);
    const dots = screen.getAllByRole('button', { pressed: undefined });
    // First dot should show ✓
    expect(dots[0]).toHaveTextContent('✓');
  });

  it('calls onStepClick when a past step label is clicked', () => {
    const onStepClick = vi.fn();
    // At currentStep=1, step 0 (Edit) is done/clickable
    render(<Stepper steps={testSteps} currentStep={1} onStepClick={onStepClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('does not call onStepClick for future steps', () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={testSteps} currentStep={0} onStepClick={onStepClick} />);

    const migrateBtn = screen.getByText('Migrate');
    expect(migrateBtn).toBeDisabled();
    fireEvent.click(migrateBtn);
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it('shows blocked indicator and title', () => {
    render(
      <Stepper
        steps={testSteps}
        currentStep={1}
        blockedSteps={{ 2: 'Fix validation errors first' }}
      />,
    );
    const dot = screen.getByText('!');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveAttribute('title', 'Fix validation errors first');
  });
});
