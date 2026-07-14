import * as React from 'react';
import { cn } from '../lib/cn';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Visual variant. Default: `info`. */
  variant?: BadgeVariant;
  /**
   * Render as a different element (e.g. a Next.js `<Link>`).
   */
  asChild?: React.ElementType;
}

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
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  function Badge({ variant = 'info', className, asChild, ...rest }, ref) {
    const Component: React.ElementType = asChild ?? 'span';
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
  },
);
