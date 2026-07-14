import * as React from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'small' | 'normal';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant. Default: `primary`. */
  variant?: ButtonVariant;
  /** Size modifier. Default: `normal`. */
  size?: ButtonSize;
  /**
   * Render as a different element (e.g. a Next.js `<Link>`). The
   * component will spread its props onto the rendered element.
   */
  asChild?: React.ElementType;
}

/**
 * Thin React wrapper around the shared `.btn` / `.btn--*` classes
 * defined in `@las-flores/ui/styles/components.css`.
 *
 * Opt-in: pages that prefer composing classes with `cn()` can
 * ignore this component. The CSS contract is the source of truth
 * — see `docs/UI_STYLE_SYSTEM.md`.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'normal', className, asChild, ...rest },
    ref,
  ) {
    const Component: React.ElementType = asChild ?? 'button';
    return (
      <Component
        ref={ref}
        className={cn(
          'btn',
          variant === 'primary' && 'btn--primary',
          variant === 'secondary' && 'btn--secondary',
          variant === 'danger' && 'btn--danger',
          size === 'small' && 'btn--small',
          className,
        )}
        {...rest}
      />
    );
  },
);
