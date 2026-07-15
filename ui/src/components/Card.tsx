import * as React from 'react';
import { cn } from '../lib/cn';

export interface CardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header content. Renders inside `.card__header` if provided. */
  header?: React.ReactNode;
  /** Optional title for the card. Renders inside `.card__title`. */
  title?: React.ReactNode;
  /** Optional metadata line for the card. Renders inside `.card__meta`. */
  meta?: React.ReactNode;
  /**
   * Render as a different element (e.g. `<section>` or `<article>`).
   */
  as?: React.ElementType;
}

/**
 * Thin React wrapper around the shared `.card` / `.card__*` classes
 * defined in `@las-flores/ui/styles/components.css`.
 *
 * Slot structure:
 *  ```
 *  <Card header={...} title={...} meta={...}>
 *    {children}
 *  </Card>
 *  ```
 *
 * The element is `<div>` by default. Pass `as` to render it
 * as a different element (e.g. an `<article>` or a Next.js
 * `<Link>`).
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  function Card(
    { header, title, meta, className, children, as: asChild, ...rest },
    ref,
  ) {
    const Component: React.ElementType = asChild ?? 'div';
    return (
      <Component
        ref={ref}
        className={cn('card', className)}
        {...rest}
      >
        {(header || title || meta) && (
          <div className="card__header">
            {title && <div className="card__title">{title}</div>}
            {meta && <div className="card__meta">{meta}</div>}
            {header}
          </div>
        )}
        {children}
      </Component>
    );
  },
);
