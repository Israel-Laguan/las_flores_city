export { cn } from './lib/cn';
export type { ClassValue } from './lib/cn';

// React component wrappers. These re-export from the
// components/ subdirectory; consumers should treat the components
// as client-side only (they use DOM events). Pages that want to use
// them in a server component must wrap usage in a 'use client' file
// or import only the underlying CSS classes from
// `@las-flores/ui/styles/components.css`.
export { Button, Input, Card, Badge } from './components';
export type {
  ButtonProps,
  ButtonOwnProps,
  ButtonVariant,
  ButtonSize,
  InputProps,
  CardProps,
  CardOwnProps,
  BadgeProps,
  BadgeOwnProps,
  BadgeVariant,
} from './components';

// Polymorphic type helpers, exported for consumers building their own
// `as`-based wrappers on top of the shared contract.
export type {
  Merge,
  AsProp,
  PolymorphicProps,
  PolymorphicPropsWithRef,
  PolymorphicRef,
} from './lib/polymorphic';
