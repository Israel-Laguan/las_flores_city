import * as React from 'react';
import { cn } from '../lib/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Render as a different element (e.g. a `textarea` or a custom
   * wrapper). The component spreads its props onto the rendered
   * element.
   */
  asChild?: React.ElementType;
}

/**
 * Thin React wrapper around the shared `.input` class defined in
 * `@las-flores/ui/styles/components.css`. Sets the input to
 * 100% width by default (the CSS rule already enforces that, but
 * keeping it here documents the contract for callers).
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, asChild, ...rest }, ref) {
    const Component: React.ElementType = asChild ?? 'input';
    return (
      <Component
        ref={ref}
        className={cn('input', className)}
        {...rest}
      />
    );
  },
);
