// api/contracts/src/condition/index.ts
// Re-exports for condition module.

export type {
  ConditionExpr,
  FlagCondition,
  NotCondition,
  AndCondition,
  OrCondition,
  TrueCondition,
  FalseCondition,
} from './expression.js';

export {
  flag,
  not,
  and,
  or,
  TRUE,
  FALSE,
  isConditionExpr,
  extractFlagSlugs,
  toJSON,
  fromJSON,
  equals,
} from './expression.js';

export type { FlagSet } from './evaluate.js';
export {
  evaluate,
  evaluateWithFlagObject,
  flagSetFromObject,
  flagObjectFromSet,
} from './evaluate.js';
