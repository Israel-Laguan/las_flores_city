import * as React from 'react';
import { cn } from '../lib/cn';
import type { PolymorphicProps, PolymorphicPropsWithRef } from '../lib/polymorphic';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

/** The `Badge`-specific props, independent of the rendered element. */
export interface BadgeOwnProps {
  /** Visual variant. Default: `info`. */
  variant?: BadgeVariant;
}

/**
 * Props for `Badge` rendered as element `C` (defaults to `span`).
 * Includes the intrinsic props of `C` plus {@link BadgeOwnProps} and
 * the `as` prop (e.g. render as a Next.js `<Link>`).
 */
export type BadgeProps<C extends React.ElementType = 'span'> =
  PolymorphicProps<C, BadgeOwnProps>;

/**
 * Thin React wrapper around the shared `.badge` / `.badge--*`
 * classes defined in `@las-flores/ui/styles/components.css`.
 *
 * Maps 1:1 to the local `admin/src/components/Badge.tsx`, but
 * lives in the shared package so any consumer can pick it up.
 * The local admin Badge can keep its CSS Module (it has a
 * slight background-color difference) or be migrated to this
 * wrapper at the caller's discretion.
 */
export function Badge<C extends React.ElementType = 'span'>({
  as,
  variant = 'info',
  className,
  ref,
  ...rest
}: PolymorphicPropsWithRef<C, BadgeOwnProps>) {
  const Component = (as ?? 'span') as React.ElementType;
  return (
    <Component
      ref={ref}
      className={cn(
        'badge',
        variant === 'success' && 'badge--success',
        variant === 'warning' && 'badge--warning',
        variant === 'danger' && 'badge--danger',
        variant === 'info' && 'badge--info',
        variant === 'muted' && 'badge--muted',
        className,
      )}
      {...rest}
    />
  );
}

Badge.displayName = 'Badge';
