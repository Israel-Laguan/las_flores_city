import * as React from 'react';
import { cn } from '../lib/cn';
import type {
  PolymorphicComponent,
  PolymorphicProps,
} from '../lib/polymorphic';

/** The `Card`-specific props, independent of the rendered element. */
export interface CardOwnProps {
  /** Optional header content. Renders inside `.card__header` if provided. */
  header?: React.ReactNode;
  /** Optional title for the card. Renders inside `.card__title`. */
  title?: React.ReactNode;
  /** Optional metadata line for the card. Renders inside `.card__meta`. */
  meta?: React.ReactNode;
}

/**
 * Props for `Card` rendered as element `C` (defaults to `div`).
 * Includes the intrinsic props of `C` plus {@link CardOwnProps} and
 * the `as` prop (e.g. render as `'section'`, `'article'`, or a Next.js
 * `<Link>`). The `title` own prop intentionally overrides the
 * intrinsic HTML `title` attribute.
 */
export type CardProps<C extends React.ElementType = 'div'> = PolymorphicProps<
  C,
  CardOwnProps
>;

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
export const Card = React.forwardRef(function Card<
  C extends React.ElementType = 'div',
>(
  { as, header, title, meta, className, children, ...rest }: CardProps<C>,
  ref: React.ForwardedRef<Element>,
) {
  const Component = (as ?? 'div') as React.ElementType;
  return (
    <Component ref={ref} className={cn('card', className)} {...rest}>
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
}) as PolymorphicComponent<'div', CardOwnProps>;

Card.displayName = 'Card';
