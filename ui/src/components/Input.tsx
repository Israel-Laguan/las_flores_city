import * as React from 'react';
import { cn } from '../lib/cn';
import type { PolymorphicProps, PolymorphicPropsWithRef } from '../lib/polymorphic';

/**
 * Props for `Input` rendered as element `C` (defaults to `input`).
 * Pass `as` to render as another element (e.g. `'textarea'`); props
 * and the forwarded `ref` are typed for the rendered element.
 */
export type InputProps<C extends React.ElementType = 'input'> =
  PolymorphicProps<C>;

/**
 * Thin React wrapper around the shared `.input` class defined in
 * `@las-flores/ui/styles/components.css`. Sets the input to
 * 100% width by default (the CSS rule already enforces that, but
 * keeping it here documents the contract for callers).
 */
export function Input<C extends React.ElementType = 'input'>({
  as,
  className,
  ref,
  ...rest
}: PolymorphicPropsWithRef<C>) {
  const Component = (as ?? 'input') as React.ElementType;
  return <Component ref={ref} className={cn('input', className)} {...rest} />;
}

Input.displayName = 'Input';
