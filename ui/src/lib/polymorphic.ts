import * as React from 'react';

/**
 * Shared type helpers for polymorphic components — wrappers that can
 * render as a different element/component via an `as` prop while
 * keeping their props and forwarded `ref` correctly typed for the
 * element actually rendered.
 *
 * Used by `Button`, `Input`, `Badge`, and `Card` so all four derive
 * their prop and ref contracts from the selected element instead of
 * being pinned to a single DOM element.
 */

/** Merge two prop sets, letting the second override the first. */
export type Merge<First, Second> = Omit<First, keyof Second> & Second;

/** The `as` prop that selects the rendered element/component. */
export interface AsProp<C extends React.ElementType> {
  /**
   * Render as a different element or component (e.g. `'textarea'`,
   * `'section'`, or a Next.js `<Link>`). The component spreads its
   * props onto the rendered element.
   */
  as?: C;
}

/**
 * Props for a polymorphic component rendered as `C`: the intrinsic
 * props of `C` merged with the component's own props `Props` and the
 * `as` prop. Own props and `as` win over the intrinsic element props.
 * The `ref` is intentionally excluded here (see
 * {@link PolymorphicPropsWithRef}).
 */
export type PolymorphicProps<
  C extends React.ElementType,
  Props = object,
> = Merge<React.ComponentPropsWithoutRef<C>, Props & AsProp<C>>;

/** The `ref` type for the rendered element `C`. */
export type PolymorphicRef<C extends React.ElementType> =
  React.ComponentPropsWithRef<C>['ref'];

/** {@link PolymorphicProps} including the polymorphic `ref`. */
export type PolymorphicPropsWithRef<
  C extends React.ElementType,
  Props = object,
> = PolymorphicProps<C, Props> & { ref?: PolymorphicRef<C> };

/**
 * Call signature for a polymorphic component built with
 * `React.forwardRef`. `DefaultElement` is what renders when no `as`
 * prop is supplied; `Props` are the component's own props.
 *
 * `React.forwardRef` erases the generic, so implementations should
 * cast the `forwardRef(...)` result to this type to restore the
 * polymorphic contract for callers.
 */
export interface PolymorphicComponent<
  DefaultElement extends React.ElementType,
  Props = object,
> {
  <C extends React.ElementType = DefaultElement>(
    props: PolymorphicPropsWithRef<C, Props>,
  ): React.ReactElement | null;
  displayName?: string;
}
