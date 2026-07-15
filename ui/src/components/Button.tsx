import * as React from 'react';
import { cn } from '../lib/cn';
import type { PolymorphicProps, PolymorphicPropsWithRef } from '../lib/polymorphic';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'small' | 'normal';

/** The `Button`-specific props, independent of the rendered element. */
export interface ButtonOwnProps {
  /** Visual variant. Default: `primary`. */
  variant?: ButtonVariant;
  /** Size modifier. Default: `normal`. */
  size?: ButtonSize;
}

/**
 * Props for `Button` rendered as element `C` (defaults to `button`).
 * Includes the intrinsic props of `C` plus {@link ButtonOwnProps} and
 * the `as` prop.
 */
export type ButtonProps<C extends React.ElementType = 'button'> =
  PolymorphicProps<C, ButtonOwnProps>;

/**
 * Thin React wrapper around the shared `.btn` / `.btn--*` classes
 * defined in `@las-flores/ui/styles/components.css`.
 *
 * Polymorphic: pass `as` to render as a different element or component
 * (e.g. a Next.js `<Link>`); props and the forwarded `ref` are typed
 * for the rendered element.
 *
 * Opt-in: pages that prefer composing classes with `cn()` can ignore
 * this component. The CSS contract is the source of truth — see
 * `docs/UI_STYLE_SYSTEM.md`.
 */
export function Button<C extends React.ElementType = 'button'>({
  as,
  variant = 'primary',
  size = 'normal',
  className,
  ref,
  ...rest
}: PolymorphicPropsWithRef<C, ButtonOwnProps>) {
  const Component = (as ?? 'button') as React.ElementType;
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
}

Button.displayName = 'Button';
