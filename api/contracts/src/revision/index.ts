// api/contracts/src/revision/index.ts
// Re-exports for revision module.

export type {
  AtomicFlip,
  AtomicFlipResult,
  ISODateString as RevisionISODateString,
  RevisionId,
  RevisionPointer,
  RevisionPointerCreate,
  RevisionPointerCreated,
  RevisionPointerRead,
  RevisionPointerReader,
  RevisionPointerRepository,
  RevisionPointerWriter,
} from './revision-pointer.js';
export {
  createRevisionPointer,
  isRevisionPointer,
  isRevisionPointerRead,
} from './revision-pointer.js';
