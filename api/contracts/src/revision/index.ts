// api/contracts/src/revision/index.ts
// Re-exports for revision module.

export type { RevisionId, ISODateString as RevisionISODateString } from './revision-pointer.js';
export {
  RevisionPointer,
  RevisionPointerRead,
  RevisionPointerCreate,
  RevisionPointerCreated,
  AtomicFlip,
  AtomicFlipResult,
  RevisionPointerReader,
  RevisionPointerWriter,
  RevisionPointerRepository,
  isRevisionPointer,
  isRevisionPointerRead,
  createRevisionPointer,
} from './revision-pointer.js';
